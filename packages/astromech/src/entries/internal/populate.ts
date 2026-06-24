/**
 * Entry population — loads related entries/users for relation fields and merges
 * them into each entry's fields. Pure orchestration: relationship lookups go
 * through the shared relationship storage and target rows through the entries
 * related-record storage; no raw DB access lives here.
 */

import type { Entry, FieldDefinition, JsonValue } from '@/types/index.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { createRelatedRecordStorage } from '../storage/related-records.js';

type PopulatedEntry = Entry & {
    _populated: Record<string, unknown | unknown[]>;
};

/**
 * Populate relation fields in entries.
 */
export async function populateEntries(
    entries: Entry[],
    fields: FieldDefinition[],
    populate: string[]
): Promise<Entry[]> {
    if (!populate || populate.length === 0) {
        return entries;
    }

    const relationshipsRepo = createRelationshipStorage();
    const records = createRelatedRecordStorage();

    // Build a map of field names to their definitions
    const relationFields = new Map<string, FieldDefinition>();
    for (const field of fields) {
        if (field.type === 'relationship' && populate.includes(field.name)) {
            relationFields.set(field.name, field);
        }
    }

    // Populate each entry
    const populated: Entry[] = [];

    for (const entry of entries) {
        const populatedEntry: PopulatedEntry = { ...entry, _populated: {} };

        // For each relation field to populate
        for (const [fieldName, fieldDef] of relationFields) {
            // Get relationships for this field
            const relationships = await relationshipsRepo.getBySource(
                entry.id,
                'entry',
                fieldName
            );

            if (relationships.length === 0) {
                populatedEntry._populated[fieldName] = fieldDef.multiple ? [] : null;
                continue;
            }

            // Group by target type to batch queries
            const entryTargets = relationships
                .filter((r) => r.targetType === 'entry')
                .map((r) => r.targetId);
            const userTargets = relationships
                .filter((r) => r.targetType === 'user')
                .map((r) => r.targetId);

            // Batch load entries and users
            const loadedEntries: Record<string, unknown> = {
                ...(await records.entriesByIds(entryTargets)),
                ...(await records.usersByIds(userTargets)),
            };

            // TODO: Load media when media table is enabled

            // Build the populated result in the correct order
            const orderedResults = relationships
                .map((r) => loadedEntries[r.targetId])
                .filter(Boolean);

            if (fieldDef.multiple) {
                populatedEntry._populated[fieldName] = orderedResults;
            } else {
                populatedEntry._populated[fieldName] = orderedResults[0] ?? null;
            }
        }

        // Merge populated values into entry.fields and strip the internal _populated map
        const mergedFields = { ...populatedEntry.fields };
        for (const [fieldName, value] of Object.entries(populatedEntry._populated)) {
            mergedFields[fieldName] = value as JsonValue;
        }
        const { _populated: _, ...rest } = populatedEntry;
        populated.push({ ...rest, fields: mergedFields });
    }

    return populated;
}
