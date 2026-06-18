import type { FieldDefinition, ScopedReads } from '@/types/fields.js';

/** Structural equality for field uniqueness (scalars common; objects via JSON compare). */
export function valuesEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Build a ScopedReads from a lazy record loader. isUnique scans the loaded
 * records for another holding the same value for the field. In-memory — fine
 * while field blobs live in a single JSON column.
 */
export function scopedReadsFromRecords<R>(opts: {
    load: () => Promise<R[]>;
    getId: (record: R) => string | undefined;
    getFields: (record: R) => Record<string, unknown>;
    excludeId?: string | undefined;
}): ScopedReads {
    return {
        async isUnique(field: FieldDefinition, value: unknown): Promise<boolean> {
            const records = await opts.load();
            for (const record of records) {
                if (opts.excludeId !== undefined && opts.getId(record) === opts.excludeId) continue;
                if (valuesEqual(opts.getFields(record)[field.name], value)) return false;
            }
            return true;
        },
    };
}
