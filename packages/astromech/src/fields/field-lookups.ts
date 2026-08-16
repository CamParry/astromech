import type { Field, FieldLookups } from '@/types/fields';
import { valuesEqual } from '@/utilities/values-equal';

/**
 * Build a FieldLookups from a lazy record loader. isUnique scans the loaded
 * records for another holding the same value for the field. In-memory — fine
 * while field blobs live in a single JSON column.
 */
export function fieldLookupsFromRecords<R>(opts: {
    load: () => Promise<R[]>;
    getId: (record: R) => string | undefined;
    getFields: (record: R) => Record<string, unknown>;
    /**
     * Rows the scan must ignore. Usually the record being written (so it does
     * not collide with itself); a merge excludes several, because more than one
     * row can legitimately hold the value being written.
     */
    excludeId?: string | readonly string[] | undefined;
    /**
     * Entry types by id, supplied by the caller because this module sits below
     * the database capability. Omit it and the target-type check is skipped.
     */
    entryTypes?: ((ids: string[]) => Promise<Map<string, string>>) | undefined;
}): FieldLookups {
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
        ...(opts.entryTypes ? { entryTypes: opts.entryTypes } : {}),
    };
}
