import { describe, expect, it } from 'vitest';
import { fieldReadsFromRecords } from '@/fields/field-reads.js';
import type { FieldDefinition } from '@/types/fields.js';

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

describe('fieldReadsFromRecords — isUnique', () => {
    it('returns true when no record holds that value', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = fieldReadsFromRecords(makeRecords(records));
        expect(await reads.isUnique(makeField('code'), 'bbb')).toBe(true);
    });

    it('returns false when another record holds the same value', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = fieldReadsFromRecords(makeRecords(records));
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('excludes the specified id when checking uniqueness', async () => {
        const records: TestRecord[] = [{ id: '1', fields: { code: 'aaa' } }];
        const reads = fieldReadsFromRecords({ ...makeRecords(records), excludeId: '1' });
        // Value held only by the excluded record — should report unique
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(true);
    });

    it('still detects a duplicate on a different record when excludeId is set', async () => {
        const records: TestRecord[] = [
            { id: '1', fields: { code: 'aaa' } },
            { id: '2', fields: { code: 'aaa' } },
        ];
        const reads = fieldReadsFromRecords({ ...makeRecords(records), excludeId: '1' });
        // Record 2 still holds 'aaa' — not unique
        expect(await reads.isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('returns true when the list is empty', async () => {
        const reads = fieldReadsFromRecords(makeRecords([]));
        expect(await reads.isUnique(makeField('code'), 'x')).toBe(true);
    });
});
