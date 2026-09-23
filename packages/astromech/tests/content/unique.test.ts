import type { DataField } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { isUniqueAmong } from '@/content/unique';

type TestRow = { id: string; fields: Record<string, unknown> };

function makeField(name: string): DataField {
    return { name, type: 'text' };
}

function load(rows: TestRow[]): () => Promise<TestRow[]> {
    return async () => rows;
}

describe('isUniqueAmong', () => {
    it('returns true when no row holds that value', async () => {
        const isUnique = isUniqueAmong(load([{ id: '1', fields: { code: 'aaa' } }]));
        expect(await isUnique(makeField('code'), 'bbb')).toBe(true);
    });

    it('returns false when another row holds the same value', async () => {
        const isUnique = isUniqueAmong(load([{ id: '1', fields: { code: 'aaa' } }]));
        expect(await isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('ignores the excluded row', async () => {
        const isUnique = isUniqueAmong(load([{ id: '1', fields: { code: 'aaa' } }]), '1');
        expect(await isUnique(makeField('code'), 'aaa')).toBe(true);
    });

    it('still finds a duplicate on another row when one is excluded', async () => {
        const isUnique = isUniqueAmong(
            load([
                { id: '1', fields: { code: 'aaa' } },
                { id: '2', fields: { code: 'aaa' } },
            ]),
            '1'
        );
        expect(await isUnique(makeField('code'), 'aaa')).toBe(false);
    });

    it('ignores every row in an excluded list', async () => {
        const isUnique = isUniqueAmong(
            load([
                { id: '1', fields: { code: 'aaa' } },
                { id: '2', fields: { code: 'aaa' } },
            ]),
            ['1', '2']
        );
        expect(await isUnique(makeField('code'), 'aaa')).toBe(true);
    });

    it('returns true when there are no rows', async () => {
        const isUnique = isUniqueAmong(load([]));
        expect(await isUnique(makeField('code'), 'x')).toBe(true);
    });
});
