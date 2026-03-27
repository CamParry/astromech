/**
 * Entry Population Utility
 * Handles loading related entries/users/media for relation fields
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Entry, FieldDefinition, FieldGroup } from '@/types/index.js';
import { RelationshipsRepository } from '@/db/repositories/relationships';
import { eq, inArray } from 'drizzle-orm';
import { entriesTable, usersTable } from '@/db/schema';

type PopulatedEntry = Entry & {
    _populated: Record<string, unknown | unknown[]>;
};

/**
 * Populate relation fields in entries
 */
export async function populateEntries(
    db: LibSQLDatabase,
    entries: Entry[],
    fieldGroups: FieldGroup[],
    populate: string[]
): Promise<Entry[]> {
    if (!populate || populate.length === 0) {
        return entries;
    }

    const relationshipsRepo = new RelationshipsRepository(db);

    // Build a map of field names to their definitions
    const relationFields = new Map<string, FieldDefinition>();
    for (const group of fieldGroups) {
        for (const field of group.fields) {
            if (field.type === 'relationship' && populate.includes(field.name)) {
                relationFields.set(field.name, field);
            }
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

            const loadedEntries: Record<string, unknown> = {};

            // Batch load entries
            if (entryTargets.length > 0) {
                const loaded = await db
                    .select()
                    .from(entriesTable)
                    .where(inArray(entriesTable.id, entryTargets));

                for (const e of loaded) {
                    loadedEntries[e.id] = e;
                }
            }

            // Batch load users
            if (userTargets.length > 0) {
                const loaded = await db
                    .select()
                    .from(usersTable)
                    .where(inArray(usersTable.id, userTargets));

                for (const u of loaded) {
                    loadedEntries[u.id] = u;
                }
            }

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
            mergedFields[fieldName] = value as import('@/types/index.js').JsonValue;
        }
        const { _populated: _, ...rest } = populatedEntry;
        populated.push({ ...rest, fields: mergedFields });
    }

    return populated;
}
