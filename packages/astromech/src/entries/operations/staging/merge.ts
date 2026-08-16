import { getCurrentUser } from '@/request-context/index';
import { createRelationshipStorage } from '@/database/storage/relationships';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { getStagingStorage, isVersioningEnabled } from '../../internal/type-config';
import { indexEntryRelationships } from '../../internal/relationships';
import { createEntryLookups } from '../../lookups';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { entryValidationMode } from '../../validation-mode.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/pipeline';
import { ValidationError } from '@/errors/index';
import { getConfig } from '@/config/registry';
import type { EntryStorage, StorageDb } from '../../storage/types';
import type { Entry, JsonObject } from '@/types/index';

export async function mergeStaged(params: { type: string; id: string }): Promise<Entry> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    const canonical = await loadAndAssertType(storage, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);

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
            user: getCurrentUser(),
            // Two rows hold this content right now and both must be invisible to
            // the uniqueness scan: the canonical (about to be overwritten with
            // it) and the staged row (about to be deleted). Excluding only one
            // makes every `unique` field collide with its own other copy.
            lookups: createEntryLookups(storage, {
                type,
                locale: canonical.locale,
                excludeId: [id, staged.id],
            }),
            ...(resourceValidate ? { resourceValidate } : {}),
        }
    );
    if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
        throw ValidationError.fromFieldErrors(processed.errors, processed.form);
    }
    const mergedFields = processed.values as JsonObject;

    const versioningOn = isVersioningEnabled(type);

    const run = async (
        txStorage: EntryStorage,
        txDb: StorageDb | undefined
    ): Promise<Entry> => {
        // 1. Backup (conditional on versioning): snapshot the canonical first so
        //    a partial failure leaves a recoverable version.
        if (versioningOn && txStorage.versions) {
            const latestNumber = await txStorage.versions.latestNumber(id);
            await txStorage.versions.create({
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
        const updated = await txStorage.update(id, {
            title: staged.title,
            fields: mergedFields,
        });

        // The canonical now holds the staged content, so its index rows derive
        // from that content — and from a source that is no longer staged.
        await indexEntryRelationships(updated, mergedFields, type, txDb);

        // 3. Cleanup: hard-delete the staged entry (its versions cascade; its
        //    index rows are not FK-bound, so drop them explicitly).
        await createRelationshipStorage(txDb).deleteByResource(staged.id, 'entry');
        await txStorage.delete(staged.id);

        return asEntry(updated);
    };

    return storage.transaction ? storage.transaction(run) : run(storage, undefined);
}
