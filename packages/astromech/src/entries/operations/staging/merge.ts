import { getCurrentUser } from '@/context/index.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage } from '../../internal/supports.js';
import { isVersioningEnabled } from '../../internal/type-config.js';
import { buildRelationsSnapshot } from '../../internal/relationships.js';
import { createEntryScopedReads } from '../../reads.js';
import { resolveEntryType } from '../../type-registry.js';
import { entryValidationStage } from '../../validation-stage.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { processFields } from '@/fields/pipeline.js';
import { getDocumentValidator } from '@/fields/document-validators.js';
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
    const entryTypeConfig = resolveEntryType(config, type);
    const fieldDefs = entryTypeConfig ? flattenEntryFields(entryTypeConfig.fields) : [];
    // The canonical's type governs: the staged row is a copy of it. Registry
    // first (the Astro config is JSON, so an authored `validate` only survives
    // boot's registration), config value second for the live-config paths.
    const documentValidate =
        getDocumentValidator(`entry:${type}`) ?? entryTypeConfig?.validate;
    const processed = await processFields(
        (staged.fields ?? {}) as Record<string, unknown>,
        fieldDefs,
        {
            operation: 'update',
            stage: entryValidationStage({
                status: canonical.status,
                hasStatuses: entryTypeConfig
                    ? entryTypeConfig.capabilities.statuses !== false
                    : true,
            }),
            host: { kind: 'entry', record: canonical },
            user: getCurrentUser(),
            // Two rows hold this content right now and both must be invisible to
            // the uniqueness scan: the canonical (about to be overwritten with
            // it) and the staged row (about to be deleted). Excluding only one
            // makes every `unique` field collide with its own other copy.
            reads: createEntryScopedReads(storage, {
                type,
                locale: canonical.locale,
                excludeId: [id, staged.id],
            }),
            ...(documentValidate ? { documentValidate } : {}),
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
            const currentRelations = await buildRelationsSnapshot(id, txDb);
            const latestNumber = await txStorage.versions.latestNumber(id);
            await txStorage.versions.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: canonical.title,
                slug: canonical.slug,
                fields: canonical.fields,
                relations: currentRelations,
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

        // Replace the canonical's relations wholesale with the staged ones.
        const relRepo = createRelationshipStorage(txDb);
        await relRepo.deleteByEntry(id);
        const stagedRels = await relRepo.getBySource(staged.id, 'entry');
        for (const rel of stagedRels) {
            await relRepo.create({
                sourceId: id,
                sourceType: 'entry',
                name: rel.name,
                targetId: rel.targetId,
                targetType: rel.targetType,
                position: rel.position,
            });
        }

        // 3. Cleanup: hard-delete the staged entry (its versions cascade; its
        //    relationship rows are not FK-bound, so drop them explicitly).
        await relRepo.deleteByEntry(staged.id);
        await txStorage.delete(staged.id);

        return asEntry(updated);
    };

    return storage.transaction ? storage.transaction(run) : run(storage, undefined);
}
