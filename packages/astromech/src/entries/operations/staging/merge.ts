import type { Entry } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { CapabilityError } from '../../errors';
import { assertCapability, isVersioningEnabled } from '../../internal/entry-type';
import { asEntry, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { toStoredFields } from '../../internal/stored-fields';
import { snapshotVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Merges the staged change into its canonical entry: validates the staged
 * content, overwrites the canonical in place, and deletes the staged row.
 * Throws if there is no staged change, or a 422 when a field validator reports.
 */
export async function mergeStagedEntry(params: {
    type: string;
    id: string;
}): Promise<Entry> {
    const { type, id } = params;

    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');

    const canonical = await getEntryOfType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);

    // The canonical's type governs: the staged row is a copy of it.
    const entryType = resolveEntryType(getConfig(), type);

    // Merging is the promotion moment: editing the staged row validates at the
    // draft stage (it is unpublished), so this is the first write where the
    // canonical's own status decides whether completeness is enforced. Run it
    // BEFORE the transaction opens so a rejection costs no backup version.
    const mergedFields = await toStoredFields({
        kind: 'merge',
        repository,
        entryType,
        type,
        canonical,
        staged,
    });

    const versioningOn = isVersioningEnabled(type);

    // Backs up the canonical, overwrites it with the staged content, and
    // hard-deletes the staged row — all in one transaction so a partial
    // failure rolls back.
    return transaction(async (): Promise<Entry> => {
        // 1. Backup (conditional on versioning): snapshot the canonical first so
        //    a partial failure leaves a recoverable version.
        if (versioningOn && repository.versions) {
            await snapshotVersion(repository.versions, canonical);
        }

        // 2. Update the canonical row in place (id + slug preserved → external
        //    refs stable) with the staged content. Status is intentionally
        //    left untouched: merging is content-only — publishing (or not) is
        //    a separate action, so an unpublished canonical stays unpublished.
        const updated = await repository.update(id, {
            title: staged.title,
            fields: mergedFields,
        });

        // The canonical now holds the staged content, so its index rows derive
        // from that content — and from a source that is no longer staged.
        await indexEntryRelationships(updated, mergedFields, type);

        // 3. Cleanup: hard-delete the staged entry (its versions cascade; its
        //    index rows are not FK-bound, so drop them explicitly).
        await createRelationshipRepository().deleteByResource(staged.id, 'entry');
        await repository.delete(staged.id);

        return asEntry(updated);
    });
}
