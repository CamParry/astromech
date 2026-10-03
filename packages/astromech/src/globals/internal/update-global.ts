import type { GlobalResource } from '../repository';
import type { WriteGuard } from '@/content/write-guard';
import type {
    AppContext,
    EntryStatus,
    JsonObject,
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
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { transaction } from '@/database/transaction';
import { entryValidationMode } from '@/entries/validation-mode';
import { ResourceNotFoundError, ResourceValidationError } from '@/errors/resource';
import { parseHookOutput, parseOutput } from '@/services/parse-method-output';
import { syncGlobalRelationships } from '../relationships';
import { globalRepository } from '../repository';
import { getDeclaredGlobal } from '../resolve-global';
import { globalSchema, updateGlobalSchema } from '../schema';
import { prepareGlobalFields } from './prepare-fields';

/**
 * Writes one locale of one global, firing the global update hooks around it, for
 * `updateGlobal` and the status methods. A locale with no row is created unless
 * `createMissingLocale` is false, and `staged` writes the staged change.
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
        /** The caller's name for its error messages: the method, or the job. */
        method: string;
        /** The patch, as `globals.update` parsed it. */
        data: ParsedGlobalUpdateData;
        /**
         * The scheduled-publish job's condition: the row must still be scheduled
         * for this time. Checked at load and again in the write.
         */
        scheduledFor?: Date | undefined;
    },
    ctx: AppContext
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
    // A staged write needs the row `createStaged` made, and a status change the
    // row an earlier write made; neither is created here.
    if ((staged || params.createMissingLocale === false) && (id === null || !current)) {
        throw new ResourceNotFoundError('global', { id: key, locale });
    }
    // A write to an existing row is conditional on the row it was decided from.
    const guard: WriteGuard | null =
        current === null
            ? null
            : { contentId: current.contentId, scheduledFor: params.scheduledFor };
    if (current !== null && guard !== null) {
        assertGuardHolds('global', { canonical: current }, guard, { id: key, locale });
    }

    // Before the fields are prepared, not only before the writes: the hook may
    // replace the patch that is written.
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
    // `input` already parsed the caller's `data`, so a failure here is the hook's.
    const data = parseHookOutput(updateGlobalSchema, context.data, 'global:beforeUpdate');
    assertWritableStatus(global, data, staged, params.method);

    const fields = await fieldsToStore({ global, id, locale, current, data, ctx });
    const patchedNames = data.fields ? patchedFieldNames(data.fields) : [];

    const updated = await transaction(async () => {
        if (staged && id !== null && guard !== null) {
            // No version and no propagation: both belong to the canonical row,
            // which the merge writes.
            const stagedRow = await writeGuarded({
                kind: 'global',
                address: { id: key, locale, staged },
                guard,
                repository: globalRepository,
                write: () =>
                    globalRepository.staging.update(
                        { id, locale },
                        { fields, updatedBy: userId },
                        guard
                    ),
            });
            if (fields) await syncGlobalRelationships(config, stagedRow.id);
            return stagedRow;
        }
        if (
            current &&
            guard !== null &&
            global.capabilities.versioning &&
            changesVersionedContent('global', current, { fields })
        ) {
            await snapshotVersion('global', globalRepository, guard, user, {
                id: key,
                locale,
            });
        }
        const row = await writeRow({
            config,
            global,
            key,
            id,
            locale,
            current,
            guard,
            fields,
            status: data.status,
            publishedAt: data.publishedAt,
            userId,
            patchedNames,
        });
        if (fields) await syncGlobalRelationships(config, row.id);
        return row;
    });

    await ctx.runHook('global:afterUpdate', {
        key,
        locale,
        global: parseOutput(globalSchema, updated, 'The global in global:afterUpdate'),
        data,
        user,
    });

    return updated;
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
    const write = { global, id, locale, current, user: ctx.user, config: ctx.config };

    if (data.fields !== undefined || current === null) {
        return prepareGlobalFields({
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
    if (completes)
        await prepareGlobalFields({ ...write, patch: {}, status: data.status });
    return undefined;
}

/**
 * Writes the row this locale needs (the global's first row, this locale's first
 * row, or an edit of one that exists) and copies the shared fields the write
 * touched out to the global's other locales.
 */
async function writeRow(params: {
    config: ResolvedConfig;
    global: ResolvedGlobal;
    key: string;
    id: string | null;
    locale: string;
    current: GlobalResource | null;
    /** Set when the write patches an existing canonical row. */
    guard: WriteGuard | null;
    fields: JsonObject | undefined;
    status: EntryStatus | undefined;
    publishedAt: Date | null | undefined;
    userId: string | null;
    patchedNames: string[];
}): Promise<GlobalResource> {
    const { config, global, id, locale, current, guard, fields, userId } = params;
    // The global's first row takes a status whether or not the write names one.
    const status = id === null ? (params.status ?? 'unpublished') : params.status;
    const publishedAt = resolvePublishedAt({
        status,
        given: params.publishedAt,
        current,
        now: new Date(),
    });

    const write = {
        fields,
        status,
        publishedAt,
        updatedBy: userId,
        ...(current ? {} : { createdBy: userId }),
    };
    const row =
        id === null
            ? await globalRepository.create(
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
            : guard === null
              ? await globalRepository.update({ id, locale }, write)
              : await writeGuarded({
                    kind: 'global',
                    address: { id: params.key, locale },
                    guard,
                    repository: globalRepository,
                    write: () => globalRepository.update({ id, locale }, write, guard),
                });
    if (fields) {
        await propagateSharedFields('global', config, {
            target: global.id,
            translatable: globalRepository.translatable,
            record: { id: row.id, locale: row.locale },
            fields,
            patchedFieldNames: params.patchedNames,
        });
    }

    return row;
}

/**
 * Refuses a status or publish gate the call cannot write: a global without
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
