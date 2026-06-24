/**
 * Relationship orchestration (entries policy): persist a form's relation fields,
 * snapshot current relations for versioning, and derive the incoming-relation
 * map for change detection. All DB access flows through the shared relationship
 * storage; an optional `db` scopes it to a transaction.
 */

import config from 'virtual:astromech/config';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { resolveEntryType } from '../type-registry.js';
import type { JsonObject } from '@/types/index.js';
import type { StorageDb } from '../storage/types.js';

export async function saveRelationships(
    entryId: string,
    fields: JsonObject,
    typeName: string,
    db?: StorageDb
): Promise<void> {
    const relationshipsRepo = createRelationshipStorage(db);
    const entryTypeConfig = resolveEntryType(config, typeName);

    if (!entryTypeConfig) return;

    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (field.type !== 'relationship') continue;
        if (!field.target) continue;

        const fieldValue = fields[field.name];
        if (!fieldValue) continue;

        const targetType = field.target === 'users' ? 'user' : 'entry';

        const targetIds = Array.isArray(fieldValue)
            ? (fieldValue as string[])
            : [fieldValue as string];

        await relationshipsRepo.replaceAll(
            entryId,
            'entry',
            field.name,
            targetIds,
            targetType
        );
    }
}

export async function buildRelationsSnapshot(
    entryId: string,
    db?: StorageDb
): Promise<Record<string, string | string[]>> {
    const relRepo = createRelationshipStorage(db);
    const rels = await relRepo.getBySource(entryId, 'entry');
    const byName = new Map<string, string[]>();
    for (const rel of rels) {
        const list = byName.get(rel.name) ?? [];
        list.push(rel.targetId);
        byName.set(rel.name, list);
    }
    const snapshot: Record<string, string | string[]> = {};
    for (const [name, ids] of byName) {
        const [first] = ids;
        snapshot[name] = ids.length === 1 && first !== undefined ? first : ids;
    }
    return snapshot;
}

export function buildIncomingRelations(
    typeName: string,
    fields: JsonObject
): Record<string, string | string[]> {
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig) return {};
    const relations: Record<string, string | string[]> = {};
    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (field.type !== 'relationship') continue;
        const val = fields[field.name];
        if (val !== undefined && val !== null) {
            relations[field.name] = val as string | string[];
        }
    }
    return relations;
}
