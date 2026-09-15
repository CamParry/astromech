/**
 * `lengthStatus`, graded against the title and description ranges the field
 * counter and the overview dashboard both use.
 */

import type { LengthStatus } from '../../src/utilities/length';
import { describe, expect, it } from 'vitest';
import {
    lengthStatus,
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
} from '../../src/utilities/length';

describe('lengthStatus', () => {
    it('grades a zero length as empty, even when the minimum is zero', () => {
        expect(lengthStatus(0, SEO_TITLE_RANGE)).toBe('empty');
        expect(lengthStatus(0, { min: 0, max: 10 })).toBe('empty');
    });

    it.each<[number, LengthStatus]>([
        [1, 'short'],
        [29, 'short'],
        [30, 'good'],
        [60, 'good'],
        [61, 'long'],
    ])('grades a %i-character title as %s', (length, status) => {
        expect(lengthStatus(length, SEO_TITLE_RANGE)).toBe(status);
    });

    it.each<[number, LengthStatus]>([
        [69, 'short'],
        [70, 'good'],
        [160, 'good'],
        [161, 'long'],
    ])('grades a %i-character description as %s', (length, status) => {
        expect(lengthStatus(length, SEO_DESCRIPTION_RANGE)).toBe(status);
    });
});
