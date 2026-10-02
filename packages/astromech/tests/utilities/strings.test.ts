/**
 * What a slug contains. `tests/entries/slug.property.test.ts` checks that every
 * slug is well formed; these cases pin the characters `slugify` keeps, drops
 * and joins.
 */

import { describe, expect, it } from 'vitest';
import { slugify } from '@/utilities/strings';

describe('slugify', () => {
    it.each([
        // lowercases
        ['Hello World', 'hello-world'],
        // drops a straight or curly apostrophe rather than hyphenating it
        ["it's", 'its'],
        ['it’s', 'its'],
        // trims leading and trailing separators
        ['  --Hello--  ', 'hello'],
        ['!Hello?', 'hello'],
        // collapses a run of separators to one hyphen
        ['a -_. b', 'a-b'],
        ['seo.section', 'seo-section'],
    ])('%j becomes %j', (input, expected) => {
        expect(slugify(input)).toBe(expected);
    });
});
