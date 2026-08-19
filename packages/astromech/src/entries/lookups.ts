import type { EntryRepository } from './repository/types';
import type { FieldLookups } from '@/types/fields';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';

/**
 * Field lookups for entry validation. `isUnique` checks no OTHER entry of
 * the same type+locale holds `value` for `field`. NOTE: entry fields live in one
 * JSON column (no per-field index), so this scans the type+locale in memory —
 * fine for now (no core field is unique by default); a JSON-indexed query is a
 * later optimisation.
 */
export function createEntryLookups(
    repository: EntryRepository,
    scope: { type: string; locale: string; excludeId?: string | readonly string[] }
): FieldLookups {
    return fieldLookupsFromRecords({
        load: async () => {
            const { data } = await repository.list({
                type: scope.type,
                locale: scope.locale,
                trashed: false,
                limit: 'all',
            });
            return data;
        },
        getId: (record) => record.id,
        getFields: (record) => (record.fields ?? {}) as Record<string, unknown>,
        excludeId: scope.excludeId,
        entryTypes: (ids) => existingEntryTypes(ids),
    });
}
