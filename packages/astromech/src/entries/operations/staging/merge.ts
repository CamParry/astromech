import type { Entry } from '@/types/index';
import { getConfig } from '@/config/registry';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { CapabilityError } from '../../errors';
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
export async function mergeStagedEntry(params: {
    type: string;
    id: string;
    locale?: string;
}): Promise<Entry> {
    const { type, id } = params;

    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');

    const canonical = await getEntryOfType(repository, type, id, params.locale);
    const stagedRow = await staging.getByCanonical(id, canonical.locale);
    if (!stagedRow) throw new Error(`No staged change for entry '${id}'`);
    const staged = asRecord(stagedRow);

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
        const updated = await repository.update(
            { id, locale: canonical.locale },
            { title: staged.title, fields: mergedFields }
        );

        // 3. Cleanup: discard the staged row before re-indexing, so the edges
        //    it held on its own do not survive the merge.
        await staging.delete({ id, locale: canonical.locale });
        await indexEntryRelationships(updated, mergedFields, type);

        return asEntry(updated);
    });
}
