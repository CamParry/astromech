import type { EntryRepository, RepositoryDb } from '../../repository/types';
import type { Entry, JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/parse-fields';
import { getCurrentUser } from '@/request-context/index';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { getStagingRepository, isVersioningEnabled } from '../../internal/type-config';
import { createEntryLookups } from '../../lookups';
import { entryValidationMode } from '../../validation-mode.shared';

/**
 * Merges the staged change into its canonical entry: validates the staged
 * content at the canonical's status, overwrites the canonical in place, and
 * deletes the staged row. Throws if there is no staged change, or a 422 when a
 * field validator reports.
 */
export async function mergeStaged(params: { type: string; id: string }): Promise<Entry> {
    const { type, id } = params;

    // Lookups
    const { repository, staging } = getStagingRepository(type);
    const canonical = await loadAndAssertType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);

    // Validation
    // Merging is the promotion moment: editing the staged row validates at the
    // draft stage (it is unpublished), so this is the first write where the
    // canonical's own status decides whether completeness is enforced. Run it
    // BEFORE the transaction opens so a rejection costs no backup version.
    const entryType = resolveEntryType(getConfig(), type);
    const fieldDefs = entryType ? flattenEntryFields(entryType.fields) : [];
    // The canonical's type governs: the staged row is a copy of it.
    const resourceValidate = entryType?.validate;
    const processed = await parseFields(
        (staged.fields ?? {}) as Record<string, unknown>,
        fieldDefs,
        {
            operation: 'update',
            validation: entryValidationMode({
                status: canonical.status,
                hasStatuses: entryType ? entryType.capabilities.statuses !== false : true,
            }),
            resource: { kind: 'entry', record: canonical },
            user: await getCurrentUser(),
            // Two rows hold this content right now and both must be invisible to
            // the uniqueness scan: the canonical (about to be overwritten with
            // it) and the staged row (about to be deleted). Excluding only one
            // makes every `unique` field collide with its own other copy.
            lookups: createEntryLookups(repository, {
                type,
                locale: canonical.locale,
                excludeId: [id, staged.id],
            }),
            ...(resourceValidate ? { resourceValidate } : {}),
        }
    );
    assertNoFieldErrors(processed);
    const mergedFields = processed.values as JsonObject;

    const versioningOn = isVersioningEnabled(type);

    // Backs up the canonical, overwrites it with the staged content, and
    // hard-deletes the staged row — all in one transaction so a partial
    // failure rolls back.
    const run = async (
        txRepository: EntryRepository,
        txDb: RepositoryDb | undefined
    ): Promise<Entry> => {
        // 1. Backup (conditional on versioning): snapshot the canonical first so
        //    a partial failure leaves a recoverable version.
        if (versioningOn && txRepository.versions) {
            const latestNumber = await txRepository.versions.latestNumber(id);
            await txRepository.versions.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: canonical.title,
                slug: canonical.slug,
                fields: canonical.fields,
                createdBy: null,
            });
        }

        // 2. Update the canonical row in place (id + slug preserved → external
        //    refs stable) with the staged content. Status is intentionally
        //    left untouched: merging is content-only — publishing (or not) is
        //    a separate action, so an unpublished canonical stays unpublished.
        const updated = await txRepository.update(id, {
            title: staged.title,
            fields: mergedFields,
        });

        // The canonical now holds the staged content, so its index rows derive
        // from that content — and from a source that is no longer staged.
        await indexEntryRelationships(updated, mergedFields, type, txDb);

        // 3. Cleanup: hard-delete the staged entry (its versions cascade; its
        //    index rows are not FK-bound, so drop them explicitly).
        await createRelationshipRepository(txDb).deleteByResource(staged.id, 'entry');
        await txRepository.delete(staged.id);

        return asEntry(updated);
    };

    return repository.transaction(run);
}
