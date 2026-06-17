import { describe, expect, it } from 'vitest';
import { tree } from '@/builders/fields.js';

describe('tree() field factory', () => {
    it('returns a POJO with type "tree"', () => {
        const result = tree('items', {
            fields: [{ name: 'label', type: 'text' }],
        });
        expect(result).toEqual({
            name: 'items',
            type: 'tree',
            fields: [{ name: 'label', type: 'text' }],
        });
    });

    it('passes maxDepth through', () => {
        const result = tree('nav', {
            maxDepth: 3,
            fields: [{ name: 'label', type: 'text' }],
        });
        expect(result.maxDepth).toBe(3);
    });

    it('passes min/max through', () => {
        const result = tree('items', {
            min: 1,
            max: 10,
            fields: [{ name: 'label', type: 'text' }],
        });
        expect(result.min).toBe(1);
        expect(result.max).toBe(10);
    });

    it('omits maxDepth when not provided', () => {
        const result = tree('items', {
            fields: [{ name: 'label', type: 'text' }],
        });
        expect('maxDepth' in result).toBe(false);
    });

    it('is a clean POJO (JSON round-trips cleanly)', () => {
        const result = tree('items', {
            maxDepth: 2,
            fields: [{ name: 'label', type: 'text' }],
        });
        const parsed = JSON.parse(JSON.stringify(result)) as unknown;
        expect(parsed).toEqual({
            name: 'items',
            type: 'tree',
            maxDepth: 2,
            fields: [{ name: 'label', type: 'text' }],
        });
    });
});
