import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { getEntryStorage } from '../storage/registry.js';
import { loadAndAssertType } from '../internal/records.js';
import type { Entry, IncomingRelation } from '@/types/index.js';

export async function incomingRelations(params: {
    type: string;
    id: string;
}): Promise<IncomingRelation[]> {
    const storage = getEntryStorage(params.type);
    await loadAndAssertType(storage, params.type, params.id);
    const relRepo = createRelationshipStorage();
    const rels = await relRepo.getByTarget(params.id, 'entry');
    const entryRels = rels.filter((r) => r.sourceType === 'entry');
    if (entryRels.length === 0) return [];

    const sourceIds = Array.from(new Set(entryRels.map((r) => r.sourceId)));
    const sources = await Promise.all(
        sourceIds.map((sourceId) => storage.get(sourceId, { includeTrashed: true }))
    );

    const byId = new Map(
        sources.filter((s): s is Entry => s !== null).map((s) => [s.id, s])
    );
    return entryRels
        .map((rel) => {
            const src = byId.get(rel.sourceId);
            if (!src) return null;
            return {
                sourceId: src.id,
                sourceTitle: src.title,
                sourceType: src.type,
                name: rel.name,
            } satisfies IncomingRelation;
        })
        .filter((x): x is IncomingRelation => x !== null);
}
