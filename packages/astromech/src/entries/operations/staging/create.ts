import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage } from '../../internal/supports.js';
import { StagedEntryExistsError } from '../../errors.js';
import type { Entry } from '@/types/index.js';

export async function createStaged(params: { type: string; id: string }): Promise<Entry> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    const canonical = await loadAndAssertType(storage, type, id);
    if (canonical.stagedFor != null) {
        throw new Error(`Entry '${id}' is itself a staged change and cannot be staged.`);
    }

    const existing = await staging.getByCanonical(id);
    if (existing) {
        throw new StagedEntryExistsError({ canonicalId: id, stagedId: existing.id });
    }

    // A staged row copies the canonical's content but gets a FRESH localeGroup
    // (it does not join the canonical's translation group) and is always
    // unpublished. The slug is shared with the canonical (kept as-is).
    const created = await storage.create({
        type,
        title: canonical.title,
        slug: canonical.slug,
        locale: canonical.locale,
        localeGroup: crypto.randomUUID(),
        fields: canonical.fields,
        status: 'unpublished',
        stagedFor: id,
        publishedAt: null,
    });

    const relRepo = createRelationshipStorage();
    const canonicalRels = await relRepo.getBySource(id, 'entry');
    for (const rel of canonicalRels) {
        await relRepo.create({
            sourceId: created.id,
            sourceType: 'entry',
            name: rel.name,
            targetId: rel.targetId,
            targetType: rel.targetType,
            position: rel.position,
        });
    }

    return asEntry(created);
}
