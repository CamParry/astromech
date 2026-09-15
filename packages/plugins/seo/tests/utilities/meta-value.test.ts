/**
 * `parseSeoMetaValue` reads whatever is stored under the `seo` field and
 * always returns `{ title?, description? }`, keeping only string values.
 */

import { describe, expect, it } from 'vitest';
import { parseSeoMetaValue } from '../../src/utilities/meta-value';

describe('parseSeoMetaValue', () => {
    it.each<[string, unknown]>([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'A title'],
        ['a number', 42],
        ['an array', [{ title: 'A title' }]],
    ])('reads %s as an empty value', (_label, value) => {
        expect(parseSeoMetaValue(value)).toStrictEqual({});
    });

    it('reads a string title and description', () => {
        expect(
            parseSeoMetaValue({ title: 'A title', description: 'A description' })
        ).toStrictEqual({ title: 'A title', description: 'A description' });
    });

    it('drops a title or description that is not a string', () => {
        expect(parseSeoMetaValue({ title: 42, description: null })).toStrictEqual({});
    });

    it('omits a key the stored value does not have', () => {
        expect(parseSeoMetaValue({ title: 'Only a title' })).toStrictEqual({
            title: 'Only a title',
        });
    });

    it('drops keys other than title and description', () => {
        expect(
            parseSeoMetaValue({ title: 'A title', preview: null, extra: 1 })
        ).toStrictEqual({ title: 'A title' });
    });

    it('keeps an empty string', () => {
        expect(parseSeoMetaValue({ title: '' })).toStrictEqual({ title: '' });
    });
});
