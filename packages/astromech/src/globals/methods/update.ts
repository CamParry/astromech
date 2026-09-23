import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { Global, JsonObject, ResolvedGlobal } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { parseInput } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { GlobalNotFoundError } from '../errors';
import { gate } from '../internal/access';
import {
    asGlobal,
    assertCapability,
    globalRepository,
    resolveGlobal,
    resolveLocale,
} from '../internal/global';
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
        if (staged) assertCapability(global, 'staging');
        const locale = resolveLocale(ctx.config, global, params.locale);
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
            throw new GlobalNotFoundError({ key: params.key, locale });
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
            data: { fields: params.data.fields },
            user,
        });
        // Parsed here, not on the way in: the method's own input schema already
        // checked what the caller sent, and a hook may have replaced `data`
        // wholesale with something it did not.
        const patch = parseInput(updateGlobalSchema, context.data).fields;

        const fields = await toStoredFields({
            repository,
            global,
            id,
            locale,
            patch,
            current,
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
                if (changesVersionedContent(current, { fields })) {
                    await snapshotVersion(repository.versions, current, user);
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
            data: { fields: patch },
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
    userId: string | null;
    patchedNames: string[];
}): Promise<Global> {
    const { repository, global, id, locale, current, fields, userId } = params;

    const row =
        id === null
            ? await repository.create(
                  { key: params.key },
                  {
                      locale,
                      fields,
                      status: 'unpublished',
                      publishedAt: null,
                      createdBy: userId,
                      updatedBy: userId,
                  }
              )
            : await repository.update(
                  { id, locale },
                  {
                      fields,
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
