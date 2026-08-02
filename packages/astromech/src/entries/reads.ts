import type { EntryStorage } from './storage/types.js';
import { scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import type { ScopedReads } from '@/types/fields.js';

/**
 * Scoped reads for entry field validation. `isUnique` checks no OTHER entry of
 * the same type+locale holds `value` for `field`. NOTE: entry fields live in one
 * JSON column (no per-field index), so this scans the type+locale in memory —
 * fine for now (no core field is unique by default); a JSON-indexed query is a
 * later optimisation.
 */
export function createEntryScopedReads(
    storage: EntryStorage,
    scope: { type: string; locale: string; excludeId?: string | readonly string[] }
): ScopedReads {
    return scopedReadsFromRecords({
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
