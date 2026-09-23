import { describe, expect, it } from 'vitest';
import { countStatus } from '@/fields/count';

describe('countStatus', () => {
    it('reads an empty value as empty, whatever the range', () => {
        expect(countStatus(0, { min: 10 })).toBe('empty');
    });

    it('places a length against the range', () => {
        expect(countStatus(3, { min: 5, max: 10 })).toBe('short');
        expect(countStatus(7, { min: 5, max: 10 })).toBe('good');
        expect(countStatus(12, { min: 5, max: 10 })).toBe('long');
    });

    it('takes either bound alone', () => {
        expect(countStatus(3, { max: 10 })).toBe('good');
        expect(countStatus(30, { min: 5 })).toBe('good');
    });
});
