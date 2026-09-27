import type { EntryResource } from '../../repository/types';
import { z } from '@hono/zod-openapi';
import { requireStagedChange } from '@/content/staging';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../../internal/access';
import { toStoredFields } from '../../internal/stored-fields';
import { getEntryOfType } from '../../read-entry';
import { syncEntryRelationships } from '../../relationships';
import { entryRepository } from '../../repository/entries-table';
import { entrySchema } from '../../schema';

/**
 * Merges a staged change into the canonical content row it was made from:
 * validates the staged content, overwrites the canonical in place, and deletes
 * the staged row. Throws if there is no staged change, or a 422 when a field
 * validator reports.
 */
export const mergeStagedEntry = defineServiceMethod({
    summary: 'Merge the staged change into an entry.',
    input: mergeStagedEntryInput({ type: z.string() }),
    output: entrySchema,
    access: entryGate('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const canonical = await getEntryOfType(type, id, params.locale);
        const { staging } = entryRepository;
        const staged = await requireStagedChange(staging, 'entry', {
            rowId: id,
            id,
            locale: canonical.locale,
        });

        // Merging is the promotion moment: editing the staged row validates at the
        // draft stage (it is unpublished), so this is the first write where the
        // canonical's own status decides whether completeness is enforced. Run it
        // BEFORE the transaction opens so a rejection costs no backup version.
        const mergedFields = await toStoredFields({
            kind: 'merge',
            config,
            type,
            canonical,
            staged,
            user,
        });

        const versioningOn =
            resolveEntryType(config, type)?.capabilities.versioning === true;

        // Backs up the canonical, overwrites it with the staged content, and
        // hard-deletes the staged row — all in one transaction so a partial
        // failure rolls back.
        return transaction(async (): Promise<EntryResource> => {
            // 1. Backup (conditional on versioning): snapshot the canonical first so
            //    a partial failure leaves a recoverable version.
            if (versioningOn) {
                await snapshotVersion('entry', entryRepository.versions, canonical, user);
            }

            // 2. Update the canonical row in place (id + slug preserved → external
            //    refs stable) with the staged content. Status is intentionally
            //    left untouched: merging is content-only — publishing (or not) is
            //    a separate action, so an unpublished canonical stays unpublished.
            const updated = await entryRepository.update(
                { id, locale: canonical.locale },
                {
                    title: staged.title,
                    fields: mergedFields,
                    updatedBy: userId,
                }
            );

            // 3. Cleanup: discard the staged row before re-indexing, so the
            //    references it held on its own do not survive the merge.
            await staging.delete({ id, locale: canonical.locale });
            await syncEntryRelationships(config, updated, type);

            return updated;
        });
    },
});

/**
 * `entries.mergeStaged`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function mergeStagedEntryInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string(), locale: z.string().optional() });
}
