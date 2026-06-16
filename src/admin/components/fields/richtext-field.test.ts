/**
 * Tests for richtext field utilities — coerceToDoc and public/full shape delivery.
 */

import { describe, expect, it } from 'vitest';
import { coerceToDoc } from './richtext-field.js';

// ============================================================================
// coerceToDoc
// ============================================================================

describe('coerceToDoc', () => {
    it('returns undefined for null', () => {
        expect(coerceToDoc(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
        expect(coerceToDoc(undefined)).toBeUndefined();
    });

    it('returns an object value as-is (JSON doc)', () => {
        const doc = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
        };
        expect(coerceToDoc(doc)).toBe(doc);
    });

    it('wraps a legacy HTML string in a paragraph doc', () => {
        const result = coerceToDoc('<p>Hello</p>');
        expect(result).not.toBeUndefined();
        expect(result?.type).toBe('doc');
        expect(result?.content).toBeDefined();
    });

    it('wraps a plain string in a paragraph doc', () => {
        const result = coerceToDoc('some text');
        expect(result?.type).toBe('doc');
    });

    it('returns undefined for empty string', () => {
        expect(coerceToDoc('')).toBeUndefined();
    });

    it('returns undefined for whitespace-only string', () => {
        expect(coerceToDoc('   ')).toBeUndefined();
    });

    it('does not crash on number value', () => {
        expect(() => coerceToDoc(42)).not.toThrow();
    });

    it('does not crash on array value', () => {
        expect(() => coerceToDoc([1, 2, 3])).not.toThrow();
    });
});
