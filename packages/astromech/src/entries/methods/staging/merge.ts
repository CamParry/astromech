import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { defineServiceMethod } from '@/services/define-service-method';
import { CapabilityError } from '../../errors';
import { entryGate } from '../../internal/access';
import { assertCapability, isVersioningEnabled } from '../../internal/entry-type';
import { asEntry, asRecord, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { toStoredFields } from '../../internal/stored-fields';
import { snapshotVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Merges a staged change into the canonical content row it was made from:
 * validates the staged content, overwrites the canonical in place, and deletes
 * the staged row. Throws if there is no staged change, or a 422 when a field
 * validator reports.
 */
export const mergeStagedEntry = defineServiceMethod({
    summary: 'Merge the staged change into an entry.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
    }),
    access: entryGate('publish'),
    requires: 'staging',
    mutates: true,
    async handler(params, ctx): Promise<Entry> {
        const { type, id } = params;

        const repository = getEntryRepository(type);
        assertCapability(ctx.config, type, 'staging');
        const { staging } = repository;
        if (!staging) throw new CapabilityError(type, 'staging');

        const canonical = await getEntryOfType(
            ctx.config,
            repository,
            type,
            id,
            params.locale
        );
        const stagedRow = await staging.getByCanonical(id, canonical.locale);
        if (!stagedRow) throw new Error(`No staged change for entry '${id}'`);
        const staged = asRecord(stagedRow);

        // The canonical's type governs: the staged row is a copy of it.
        const entryType = resolveEntryType(ctx.config, type);

        // Merging is the promotion moment: editing the staged row validates at the
        // draft stage (it is unpublished), so this is the first write where the
        // canonical's own status decides whether completeness is enforced. Run it
        // BEFORE the transaction opens so a rejection costs no backup version.
        const mergedFields = await toStoredFields({
            kind: 'merge',
            config: ctx.config,
            repository,
            entryType,
            type,
            canonical,
            staged,
            user: ctx.user,
        });

        const versioningOn = isVersioningEnabled(ctx.config, type);

        // Backs up the canonical, overwrites it with the staged content, and
        // hard-deletes the staged row — all in one transaction so a partial
        // failure rolls back.
        return transaction(async (): Promise<Entry> => {
            // 1. Backup (conditional on versioning): snapshot the canonical first so
            //    a partial failure leaves a recoverable version.
            if (versioningOn && repository.versions) {
                await snapshotVersion(repository.versions, canonical, ctx.user);
            }

            // 2. Update the canonical row in place (id + slug preserved → external
            //    refs stable) with the staged content. Status is intentionally
            //    left untouched: merging is content-only — publishing (or not) is
            //    a separate action, so an unpublished canonical stays unpublished.
            const updated = await repository.update(
                { id, locale: canonical.locale },
                { title: staged.title, fields: mergedFields }
            );

            // 3. Cleanup: discard the staged row before re-indexing, so the edges
            //    it held on its own do not survive the merge.
            await staging.delete({ id, locale: canonical.locale });
            await indexEntryRelationships(ctx.config, updated, mergedFields, type);

            return asEntry(updated);
        });
    },
});
