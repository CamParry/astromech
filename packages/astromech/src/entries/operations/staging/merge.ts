import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage } from '../../internal/supports.js';
import { isVersioningEnabled } from '../../internal/type-config.js';
import { buildRelationsSnapshot } from '../../internal/relationships.js';
import type { EntryStorage, StorageDb } from '../../storage/types.js';
import type { Entry } from '@/types/index.js';

export async function mergeStaged(params: { type: string; id: string }): Promise<Entry> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    const canonical = await loadAndAssertType(storage, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);

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
            fields: staged.fields,
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
