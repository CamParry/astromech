/**
 * The uniqueness check every resource's field parse runs: no other row in the
 * same scope holds the value. Field data lives in one JSON column, so the scan
 * runs in memory over rows the resource loads.
 */

import type { DataField } from '@/types/fields';
import { valuesEqual } from '@/utilities/values-equal';

/** What the scan reads from one row. */
type ScannedRow = { id: string; fields?: unknown };

/**
 * Build an `isUnique` check from a lazy loader of the rows in scope (one entry
 * type and locale, one locale of media or users, nothing for a global).
 *
 * @param excludeId Rows the scan ignores: usually the row being written, so it
 *   does not collide with itself.
 */
export function isUniqueAmong(
    load: () => Promise<readonly ScannedRow[]>,
    excludeId?: string | readonly string[]
): (field: DataField, value: unknown) => Promise<boolean> {
    const excluded =
        excludeId === undefined
            ? []
            : typeof excludeId === 'string'
              ? [excludeId]
              : excludeId;
    return async (field: DataField, value: unknown): Promise<boolean> => {
        for (const row of await load()) {
            if (excluded.includes(row.id)) continue;
            const fields = (row.fields ?? {}) as Record<string, unknown>;
            if (valuesEqual(fields[field.name], value)) return false;
        }
        return true;
    };
}
