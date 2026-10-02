/**
 * Structural equality over JSON-like values, which decides whether a content
 * write changed the fields enough to need a new version.
 */

import { describe, expect, it } from 'vitest';
import { deepEqual } from '@/utilities/deep-equal';

describe('deepEqual', () => {
    it.each([
        ['equal strings', 'a', 'a', true],
        ['equal numbers', 1, 1, true],
        ['a number and the same digit as a string', 1, '1', false],
        ['an object and a number', {}, 0, false],
        ['null and an object', null, {}, false],
        ['an object and null', {}, null, false],
        ['an array and an object', [], {}, false],
        ['arrays of different lengths', [1], [1, 2], false],
        ['equal nested arrays', [1, [2, 3]], [1, [2, 3]], true],
        ['arrays in a different order', [1, 2], [2, 1], false],
        [
            'nested objects with keys in a different order',
            { a: 1, b: { c: 2, d: 3 } },
            { b: { d: 3, c: 2 }, a: 1 },
            true,
        ],
        [
            'objects with the same key count but different keys',
            { a: undefined },
            { b: 1 },
            false,
        ],
        [
            'objects that differ in a nested value',
            { a: { b: [1, 2] } },
            { a: { b: [1, 3] } },
            false,
        ],
    ])('compares %s', (_label, a, b, expected) => {
        expect(deepEqual(a, b)).toBe(expected);
    });
});
