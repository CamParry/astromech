import { describe, expect, it } from 'vitest';
import { valuesEqual } from '@/utilities/values-equal';

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
