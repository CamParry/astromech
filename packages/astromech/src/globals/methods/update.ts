import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { EntryStatus, Global, JsonObject, ResolvedGlobal } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError, ResourceValidationError } from '@/errors/resource';
import { parseInput } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../internal/access';
import { asGlobal, globalRepository, resolveGlobal } from '../internal/global';
import { syncGlobalRelationships } from '../internal/relationships';
import { patchedFieldNames, toStoredFields } from '../internal/stored-fields';
import { localised, updateGlobalSchema } from '../schema';

/**
 * Writes one locale of one global, firing the global write hooks around it.
 * Rows are created on demand: a global nothing has saved gets its `globals` row
 * and this locale's content row, and a translatable global whose locale has no
 * row gets one with the shared fields inherited from the default-locale row.
 *
 * `staged` writes the staged change for that locale instead, which is how an
 * editor drafts against a live global. It must already exist — only
 * `createStaged` makes one — and it takes no version and propagates no shared
 * fields, both of which belong to the canonical row the merge writes to.
 */
export const updateGlobal = defineServiceMethod({
    summary:
        'Update a global. Fields merge: omitted fields keep their current ' +
        'value, and arrays are replaced whole. `staged` writes the staged ' +
        'change instead of the canonical row.',
    input: localised.extend({
        staged: z.boolean().optional(),
        data: updateGlobalSchema,
    }),
    access: gate('update'),
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<Global> {
        const global = resolveGlobal(ctx.config, params.key);
        const staged = params.staged === true;
        if (staged) assertCapability('global', global, 'staging');
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.global,
            ctx.config,
            global.id,
            params.locale
        );
        const repository = globalRepository(ctx.config);
        const user = ctx.user;

        const id = await repository.idByKey(params.key);
        const current =
            id === null
                ? null
                : staged
                  ? await repository.staging.getByCanonical(id, locale)
                  : await repository.get({ id, locale });
        // A staged write addresses a row `createStaged` made; there is nothing
        // here to create one from.
        if (staged && (id === null || !current)) {
            throw new ResourceNotFoundError('global', { id: params.key, locale });
        }
        /** The staged row this write targets, absent on a canonical write. */
        const stagedRef = staged && id !== null ? { id, locale } : null;

        // The before-hook may replace the context, and with it the patch that is
        // written — so it runs before the fields are parsed, not just before the
        // transaction opens.
        const context = await ctx.runHook('global:beforeUpdate', {
            key: params.key,
            locale,
            global: current ? asGlobal(current) : null,
            data: params.data,
            user,
        });
        // Parsed here, not on the way in: the method's own input schema already
        // checked what the caller sent, and a hook may have replaced `data`
        // wholesale with something it did not.
        const data = parseInput(updateGlobalSchema, context.data);
        const patch = data.fields ?? {};
        assertWritableStatus(global, data, staged, ctx.method.name);

        const fields = await toStoredFields({
            repository,
            global,
            id,
            locale,
            patch,
            current,
            // A write that changes no status keeps the row's own, so editing a
            // published global still enforces completeness.
            status: data.status ?? current?.status,
            user,
            defaultLocale: defaultContentLocale(ctx.config),
            config: ctx.config,
        });

        // The version, the row write and the index write are one transaction:
        // an index that outlived a failed write would name relations the stored
        // fields do not.
        const saved = await transaction(async () => {
            if (stagedRef) {
                // No version and no propagation: the history and the shared
                // fields belong to the canonical row, which the merge is what
                // writes to.
                const row = await repository.staging.update(stagedRef, {
                    fields,
                    updatedBy: user?.id ?? null,
                });
                await syncGlobalRelationships(ctx.config, row.id);
                return asGlobal(row);
            }
            if (current && global.capabilities.versioning) {
                if (changesVersionedContent(RESOURCE_SPECS.global, current, { fields })) {
                    await snapshotVersion(
                        RESOURCE_SPECS.global,
                        repository.versions,
                        current,
                        user
                    );
                }
            }
            const written = await writeRow({
                repository,
                global,
                key: params.key,
                id,
                locale,
                current,
                fields,
                status: data.status,
                publishedAt: data.publishedAt,
                userId: user?.id ?? null,
                patchedNames: patchedFieldNames(patch),
            });
            await syncGlobalRelationships(ctx.config, written.id);
            return written;
        });

        await ctx.runHook('global:afterUpdate', {
            key: params.key,
            locale,
            global: saved,
            data,
            user,
        });

        return saved;
    },
});

/**
 * Write the row this locale needs — the global's first row, this locale's first
 * row, or an edit of one that exists — and copy the shared fields the write
 * touched out to the global's other locales.
 */
async function writeRow(params: {
    repository: GlobalsRepository;
    global: ResolvedGlobal;
    key: string;
    id: string | null;
    locale: string;
    current: GlobalRow | null;
    fields: JsonObject;
    status: EntryStatus | undefined;
    publishedAt: Date | null | undefined;
    userId: string | null;
    patchedNames: string[];
}): Promise<Global> {
    const { repository, global, id, locale, current, fields, userId, status } = params;
    // Publishing stamps the gate when the row has none yet, as `publish` does.
    const publishedAt =
        status === 'published' && !current?.publishedAt
            ? (params.publishedAt ?? new Date())
            : params.publishedAt;

    const row =
        id === null
            ? await repository.create(
                  { key: params.key },
                  {
                      locale,
                      fields,
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

    await propagateSharedFields({
        translatable: repository.translatable,
        definitions: flattenEntryFields(global.fields),
        isTranslatable: global.capabilities.translatable,
        record: { id: row.id, locale: row.locale },
        fields,
        patchedFieldNames: params.patchedNames,
    });

    return asGlobal(row);
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
