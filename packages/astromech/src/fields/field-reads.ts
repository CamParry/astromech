import type { Field, FieldReads } from '@/types/fields.js';
import { valuesEqual } from '@/utilities/values-equal.js';

/**
 * Build a FieldReads from a lazy record loader. isUnique scans the loaded
 * records for another holding the same value for the field. In-memory — fine
 * while field blobs live in a single JSON column.
 */
export function fieldReadsFromRecords<R>(opts: {
    load: () => Promise<R[]>;
    getId: (record: R) => string | undefined;
    getFields: (record: R) => Record<string, unknown>;
    /**
     * Rows the scan must ignore. Usually the record being written (so it does
     * not collide with itself); a merge excludes several, because more than one
     * row can legitimately hold the value being written.
     */
    excludeId?: string | readonly string[] | undefined;
}): FieldReads {
    const excluded =
        opts.excludeId === undefined
            ? []
            : typeof opts.excludeId === 'string'
              ? [opts.excludeId]
              : opts.excludeId;
    return {
        async isUnique(field: Field, value: unknown): Promise<boolean> {
            const records = await opts.load();
            for (const record of records) {
                const id = opts.getId(record);
                if (id !== undefined && excluded.includes(id)) continue;
                if (valuesEqual(opts.getFields(record)[field.name], value)) return false;
            }
            return true;
        },
    };
}
