import { describe, expect, it } from 'vitest';
import { defaultCellKind } from './cell-kind-map.js';

describe('defaultCellKind', () => {
    it('maps known field types to their cell kind', () => {
        expect(defaultCellKind('boolean')).toBe('boolean');
        expect(defaultCellKind('number')).toBe('number');
        expect(defaultCellKind('range')).toBe('number');
        expect(defaultCellKind('date')).toBe('date');
        expect(defaultCellKind('datetime')).toBe('date');
        expect(defaultCellKind('slug')).toBe('slug');
        expect(defaultCellKind('relationship')).toBe('relationship');
    });

    it('falls back to text for unmapped field types', () => {
        expect(defaultCellKind('text')).toBe('text');
        expect(defaultCellKind('select')).toBe('text');
        expect(defaultCellKind('email')).toBe('text');
        expect(defaultCellKind('something-custom')).toBe('text');
    });
});
