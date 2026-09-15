/**
 * `sortPatch` is applied by both the grid's sort Select and the table's column
 * headers, so a key it cannot honour has to clear the sort rather than pass on.
 */

import { describe, expect, it } from 'vitest';
import { sortPatch } from '@/admin/components/media/media-sort-select';

const CLEARED = { sort: undefined, dir: undefined, page: 1 };

describe('sortPatch', () => {
    it('should clear the sort when the direction is null', () => {
        expect(sortPatch('size', null)).toStrictEqual(CLEARED);
    });

    it('should clear the sort for the unsorted option', () => {
        expect(sortPatch('none', 'asc')).toStrictEqual(CLEARED);
    });

    it('should clear the sort for an unknown key in either direction', () => {
        expect(sortPatch('colour', 'asc')).toStrictEqual(CLEARED);
        expect(sortPatch('colour', 'desc')).toStrictEqual(CLEARED);
    });

    it('should return an ascending pair for a known key', () => {
        expect(sortPatch('filename', 'asc')).toStrictEqual({
            sort: 'filename',
            dir: 'asc',
            page: 1,
        });
    });

    it('should return a descending pair for a known key', () => {
        expect(sortPatch('createdAt', 'desc')).toStrictEqual({
            sort: 'createdAt',
            dir: 'desc',
            page: 1,
        });
    });

    it('should reset the page for every sortable column', () => {
        for (const key of ['filename', 'mimeType', 'size', 'createdAt']) {
            expect(sortPatch(key, 'asc').page).toBe(1);
        }
    });
});
