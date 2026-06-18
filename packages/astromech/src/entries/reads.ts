import type { EntryStorage } from './storage/types.js';
import type { FieldDefinition, ScopedReads } from '@/types/fields.js';

/**
 * Scoped reads for entry field validation. `isUnique` checks no OTHER entry of
 * the same type+locale holds `value` for `field`. NOTE: entry fields live in one
 * JSON column (no per-field index), so this scans the type+locale in memory —
 * fine for now (no core field is unique by default); a JSON-indexed query is a
 * later optimisation.
 */
export function createEntryScopedReads(
    storage: EntryStorage,
    scope: { type: string; locale: string; excludeId?: string },
): ScopedReads {
    return {
        async isUnique(field: FieldDefinition, value: unknown): Promise<boolean> {
            const { data } = await storage.list({
                type: scope.type,
                locale: scope.locale,
                trashed: false,
                limit: 'all',
            });
            for (const record of data) {
                if (scope.excludeId !== undefined && record.id === scope.excludeId) continue;
                const fields = (record.fields ?? {}) as Record<string, unknown>;
                if (valuesEqual(fields[field.name], value)) return false;
            }
            return true;
        },
    };
}

// Structural equality good enough for field uniqueness (scalars are the common
// case; objects fall back to JSON compare — key-order sensitive, acceptable here).
function valuesEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
}
