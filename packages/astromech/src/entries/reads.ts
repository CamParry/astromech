import type { EntryStorage } from './storage/types.js';
import { fieldReadsFromRecords } from '@/fields/field-reads.js';
import type { FieldReads } from '@/types/fields.js';

/**
 * Field reads for entry validation. `isUnique` checks no OTHER entry of
 * the same type+locale holds `value` for `field`. NOTE: entry fields live in one
 * JSON column (no per-field index), so this scans the type+locale in memory —
 * fine for now (no core field is unique by default); a JSON-indexed query is a
 * later optimisation.
 */
export function createEntryFieldReads(
    storage: EntryStorage,
    scope: { type: string; locale: string; excludeId?: string | readonly string[] }
): FieldReads {
    return fieldReadsFromRecords({
        load: async () => {
            const { data } = await storage.list({
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
    });
}
