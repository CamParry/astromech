import type { Field } from '@/types/fields';
import { valuesEqual } from '@/utilities/values-equal';

/**
 * Build an `isUnique` check from a lazy record loader: it scans the loaded
 * records for another holding the same value for the field. In memory, which is
 * fine while field data lives in a single JSON column.
 */
export function uniqueAmongRecords<R>(opts: {
    load: () => Promise<R[]>;
    getId: (record: R) => string | undefined;
    getFields: (record: R) => Record<string, unknown>;
    /**
     * Rows the scan must ignore. Usually the record being written (so it does
     * not collide with itself); a merge excludes several, because more than one
     * row can legitimately hold the value being written.
     */
    excludeId?: string | readonly string[] | undefined;
}): (field: Field, value: unknown) => Promise<boolean> {
    const excluded =
        opts.excludeId === undefined
            ? []
            : typeof opts.excludeId === 'string'
              ? [opts.excludeId]
              : opts.excludeId;
    return async (field: Field, value: unknown): Promise<boolean> => {
        const records = await opts.load();
        for (const record of records) {
            const id = opts.getId(record);
            if (id !== undefined && excluded.includes(id)) continue;
            if (valuesEqual(opts.getFields(record)[field.name], value)) return false;
        }
        return true;
    };
}
