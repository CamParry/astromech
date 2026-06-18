import { describe, expect, it } from 'vitest';
import { valuesEqual, scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import type { FieldDefinition } from '@/types/fields.js';

// ---------------------------------------------------------------------------
// valuesEqual
// ---------------------------------------------------------------------------

describe('valuesEqual', () => {
    it('returns true for identical primitives', () => {
        expect(valuesEqual(1, 1)).toBe(true);
        expect(valuesEqual('a', 'a')).toBe(true);
        expect(valuesEqual(true, true)).toBe(true);
        expect(valuesEqual(null, null)).toBe(true);
        expect(valuesEqual(undefined, undefined)).toBe(true);
    });

    it('returns false for different primitives', () => {
        expect(valuesEqual(1, 2)).toBe(false);
        expect(valuesEqual('a', 'b')).toBe(false);
        expect(valuesEqual(true, false)).toBe(false);
    });

    it('returns false when one side is null', () => {
        expect(valuesEqual(null, {})).toBe(false);
        expect(valuesEqual({}, null)).toBe(false);
    });

    it('compares objects by JSON equality', () => {
        expect(valuesEqual({ x: 1 }, { x: 1 })).toBe(true);
        expect(valuesEqual({ x: 1 }, { x: 2 })).toBe(false);
    });

    it('compares arrays by JSON equality', () => {
        expect(valuesEqual([1, 2], [1, 2])).toBe(true);
        expect(valuesEqual([1, 2], [1, 3])).toBe(false);
    });

    it('returns false for primitive vs object', () => {
        expect(valuesEqual(1, {})).toBe(false);
        expect(valuesEqual('a', {})).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// scopedReadsFromRecords
// ---------------------------------------------------------------------------

type TestRecord = { id: string; fields: Record<string, unknown> };

function makeField(name: string): FieldDefinition {
    return { name, type: 'text' };
}

function makeRecords(items: TestRecord[]) {
    return {
        load: async () => items,
        getId: (r: TestRecord) => r.id,
        getFields: (r: TestRecord) => r.fields,
    };
}

describe('scopedReadsFromRecords — isUnique', () => {
    it('returns true when no record holds that value', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = scopedReadsFromRecords(makeRecords(records));
        expect(await reads.isUnique(makeField('code'), 'bbb')).toBe(true);
    });

    it('returns false when another record holds the same value', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = scopedReadsFromRecords(makeRecords(records));
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('excludes the specified id when checking uniqueness', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = scopedReadsFromRecords({ ...makeRecords(records), excludeId: '1' });
        // Value held only by the excluded record — should report unique
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(true);
    });

    it('still detects a duplicate on a different record when excludeId is set', async () => {
        const records: TestRecord[] = [
            { id: '1', fields: { code: 'aaa' } },
            { id: '2', fields: { code: 'aaa' } },
        ];
        const reads = scopedReadsFromRecords({ ...makeRecords(records), excludeId: '1' });
        // Record 2 still holds 'aaa' — not unique
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('returns true when the list is empty', async () => {
        const reads = scopedReadsFromRecords(makeRecords([]));
        expect(await reads.isUnique(makeField('code'), 'x')).toBe(true);
    });
});
