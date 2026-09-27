import type { GlobalRepository, GlobalResource } from '../repository';
import type {
    AppContext,
    EntryStatus,
    JsonObject,
    MethodContext,
    ParsedGlobalUpdateData,
    ResolvedConfig,
    ResolvedGlobal,
} from '@/types/index';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { patchedFieldNames } from '@/content/prepare-fields';
import { resolvePublishedAt } from '@/content/published-at';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { entryValidationMode } from '@/entries/validation-mode';
import { ResourceNotFoundError, ResourceValidationError } from '@/errors/resource';
import { parseHookOutput, parseOutput } from '@/services/parse-method-output';
import { syncGlobalRelationships } from '../relationships';
import { globalRepository } from '../repository';
import { getDeclaredGlobal } from '../resolve-global';
import { globalSchema, updateGlobalSchema } from '../schema';
import { toStoredFields } from './stored-fields';

/**
 * Writes one locale of one global, firing the global update hooks around it.
 * `updateGlobal` and the status methods both call it; a locale with no row is
 * created unless `createMissingLocale` is false, and `staged` writes the staged change.
 */
export async function updateGlobalLocale(
    params: {
        key: string;
        locale?: string | undefined;
        /** Write this locale's staged change instead of its canonical row. */
        staged?: boolean | undefined;
        /**
         * Write a locale with no content row yet, creating it. Only `update` sets
         * it: a status change addresses a row that must already exist.
         */
        createMissingLocale?: boolean | undefined;
        /** The patch, as `globals.update` parsed it. */
        data: ParsedGlobalUpdateData;
    },
    ctx: AppContext & MethodContext
): Promise<GlobalResource> {
    const { key } = params;
    const { config, user } = ctx;
    const userId = user?.id ?? null;
    const staged = params.staged === true;
    const global = getDeclaredGlobal(config, key);
    if (staged) assertCapability('global', global, 'staging');
    const locale = resolveResourceLocale('global', config, global.id, params.locale);

    const canonical = staged ? null : await globalRepository.findByKey(key, locale);
    // A locale with no row yet still needs the id when the global exists.
    const id = canonical?.id ?? (await globalRepository.findIdByKey(key));
    const current = staged
        ? id === null
            ? null
            : await globalRepository.staging.findOne({ id, locale })
        : canonical;
    // A staged write addresses a row `createStaged` made, and a status change a
    // row an earlier write made; there is nothing here to create either from.
    if ((staged || params.createMissingLocale === false) && (id === null || !current)) {
        throw new ResourceNotFoundError('global', { id: key, locale });
    }
    /** The staged row this write targets, absent on a canonical write. */
    const stagedRef = staged && id !== null ? { id, locale } : null;

    // The before-hook may replace the context, and with it the patch that is
    // written, so it runs before the fields are parsed, not just before the
    // transaction opens.
    const context = await ctx.runHook('global:beforeUpdate', {
        key,
        locale,
        global:
            current === null
                ? null
                : parseOutput(globalSchema, current, 'The global in global:beforeUpdate'),
        data: params.data,
        user,
    });
    // The method's input already parsed the caller's `data` with this same
    // schema, so a failure here is the hook's, which replaced it.
    const data = parseHookOutput(updateGlobalSchema, context.data, 'global:beforeUpdate');
    assertWritableStatus(global, data, staged, ctx.method.name);

    const fields = await fieldsToStore({ global, id, locale, current, data, ctx });

    // The version, the row write and the index write are one transaction: an
    // index that outlived a failed write would name relations the stored
    // fields do not.
    const saved = await transaction(async () => {
        if (stagedRef) {
            // No version and no propagation: the history and the shared fields
            // belong to the canonical row, which the merge is what writes to.
            const row = await globalRepository.staging.update(stagedRef, {
                fields,
                updatedBy: userId,
            });
            if (fields) await syncGlobalRelationships(config, row.id);
            return row;
        }
        if (current && global.capabilities.versioning) {
            if (changesVersionedContent('global', current, { fields })) {
                await snapshotVersion('global', globalRepository.versions, current, user);
            }
        }
        const written = await writeRow({
            config,
            repository: globalRepository,
            global,
            key,
            id,
            locale,
            current,
            fields,
            status: data.status,
            publishedAt: data.publishedAt,
            userId,
            patchedNames: data.fields ? patchedFieldNames(data.fields) : [],
        });
        if (fields) await syncGlobalRelationships(config, written.id);
        return written;
    });

    await ctx.runHook('global:afterUpdate', {
        key,
        locale,
        global: parseOutput(globalSchema, saved, 'The global in global:afterUpdate'),
        data,
        user,
    });

    return saved;
}

/**
 * The fields a write stores, or undefined to leave them as they are. A write
 * with no fields patch rewrites nothing, but one that moves the row to a
 * complete status still checks the stored fields in complete mode.
 */
async function fieldsToStore(params: {
    global: ResolvedGlobal;
    id: string | null;
    locale: string;
    current: GlobalResource | null;
    data: ParsedGlobalUpdateData;
    ctx: AppContext;
}): Promise<JsonObject | undefined> {
    const { global, id, locale, current, data, ctx } = params;
    const write = {
        repository: globalRepository,
        global,
        id,
        locale,
        current,
        user: ctx.user,
        config: ctx.config,
    };
    if (data.fields !== undefined || current === null) {
        return toStoredFields({
            ...write,
            patch: data.fields ?? {},
            // A write that changes no status keeps the row's own, so editing a
            // published global still enforces completeness.
            status: data.status ?? current?.status,
        });
    }
    const completes =
        data.status !== undefined &&
        entryValidationMode({
            status: data.status,
            hasStatuses: global.capabilities.statuses,
        }) === 'complete';
    // The parse throws the 422; its values are not written.
    if (completes) await toStoredFields({ ...write, patch: {}, status: data.status });
    return undefined;
}

/**
 * Write the row this locale needs (the global's first row, this locale's first
 * row, or an edit of one that exists) and copy the shared fields the write
 * touched out to the global's other locales.
 */
async function writeRow(params: {
    config: ResolvedConfig;
    repository: GlobalRepository;
    global: ResolvedGlobal;
    key: string;
    id: string | null;
    locale: string;
    current: GlobalResource | null;
    fields: JsonObject | undefined;
    status: EntryStatus | undefined;
    publishedAt: Date | null | undefined;
    userId: string | null;
    patchedNames: string[];
}): Promise<GlobalResource> {
    const { config, repository, global, id, locale, current, fields, userId } = params;
    // The global's first row takes a status whether or not the write names one.
    const status = id === null ? (params.status ?? 'unpublished') : params.status;
    const publishedAt = resolvePublishedAt({
        status,
        given: params.publishedAt,
        current: current?.publishedAt ?? null,
        now: new Date(),
    });

    const row =
        id === null
            ? await repository.create(
                  { key: params.key, createdBy: userId, updatedBy: userId },
                  {
                      locale,
                      fields: fields ?? {},
                      status: status ?? 'unpublished',
                      publishedAt: publishedAt ?? null,
                      createdBy: userId,
                      updatedBy: userId,
                  }
              )
            : await repository.update(
                  { id, locale },
                  {
                      fields,
                      status,
                      publishedAt,
                      // Moves with `updatedAt`, not with the version snapshot.
                      updatedBy: userId,
                      // A locale being written for the first time is authored
                      // now, whoever created the global itself.
                      ...(current ? {} : { createdBy: userId }),
                  }
              );

    if (fields) {
        await propagateSharedFields('global', config, {
            target: global.id,
            translatable: repository.translatable,
            record: { id: row.id, locale: row.locale },
            fields,
            patchedFieldNames: params.patchedNames,
        });
    }

    return row;
}

/**
 * Refuse a status or publish gate the call cannot write: a global without
 * statuses has neither, and a staged change takes the canonical's on merge.
 */
function assertWritableStatus(
    global: ResolvedGlobal,
    data: { status?: unknown; publishedAt?: unknown },
    staged: boolean,
    method: string
): void {
    if (data.status === undefined && data.publishedAt === undefined) return;
    assertCapability('global', global, 'statuses');
    if (staged) {
        throw new ResourceValidationError([
            `${method}: a staged change carries no status; merge it, then publish.`,
        ]);
    }
}
