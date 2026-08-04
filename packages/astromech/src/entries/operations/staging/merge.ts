import { getCurrentUser } from '@/request-context/index.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage, isVersioningEnabled } from '../../internal/type-config.js';
import { indexEntryRelationships } from '../../internal/relationships.js';
import { createEntryFieldReads } from '../../reads.js';
import { resolveEntryType } from '../../type-ids.js';
import { entryValidationStage } from '../../validation-stage.js';
import { flattenEntryFields } from '@/fields/flatten.js';
import { processFields } from '@/fields/pipeline.js';
import { getResourceValidator } from '@/fields/resource-validators.js';
import { ValidationError } from '@/errors/index.js';
import config from 'virtual:astromech/config';
import type { EntryStorage, StorageDb } from '../../storage/types.js';
import type { Entry, JsonObject } from '@/types/index.js';

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
    const entryType = resolveEntryType(config, type);
    const fieldDefs = entryType ? flattenEntryFields(entryType.fields) : [];
    // The canonical's type governs: the staged row is a copy of it. Registry
    // first (the Astro config is JSON, so an authored `validate` only survives
    // boot's registration), config value second for the live-config paths.
    const resourceValidate = getResourceValidator(`entry:${type}`) ?? entryType?.validate;
    const processed = await processFields(
        (staged.fields ?? {}) as Record<string, unknown>,
        fieldDefs,
        {
            operation: 'update',
            stage: entryValidationStage({
                status: canonical.status,
                hasStatuses: entryType ? entryType.capabilities.statuses !== false : true,
            }),
            host: { kind: 'entry', record: canonical },
            user: getCurrentUser(),
            // Two rows hold this content right now and both must be invisible to
            // the uniqueness scan: the canonical (about to be overwritten with
            // it) and the staged row (about to be deleted). Excluding only one
            // makes every `unique` field collide with its own other copy.
            reads: createEntryFieldReads(storage, {
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
