/**
 * Pure-logic tests for the forms plugin's email helpers: merge-tag
 * substitution and value-row shaping. No DB, no `PluginContext`, no
 * component rendering — those belong to a later slice.
 */

import { describe, expect, it } from 'vitest';
import {
    applyMergeTags,
    mergeTagValues,
} from '../../../../plugins/forms/src/notifications/merge-tags';
import {
    displayValue,
    toValueRows,
} from '../../../../plugins/forms/src/utilities/values';

describe('applyMergeTags', () => {
    it('substitutes a known token', () => {
        expect(applyMergeTags('Hi {{name}}!', { name: 'Ada' })).toBe('Hi Ada!');
    });

    it('leaves an unknown token intact rather than deleting it', () => {
        expect(applyMergeTags('Hi {{name}}!', {})).toBe('Hi {{name}}!');
    });

    it('tolerates inner whitespace around the key', () => {
        expect(applyMergeTags('Hi {{ name }}!', { name: 'Ada' })).toBe('Hi Ada!');
    });

    it('does not re-expand a replacement value that itself contains {{...}}', () => {
        expect(applyMergeTags('Body: {{body}}', { body: '{{name}}' })).toBe(
            'Body: {{name}}'
        );
    });
});

describe('mergeTagValues', () => {
    it('flattens submitted data plus formTitle/submittedAt into string tags', () => {
        const tags = mergeTagValues(
            { name: 'Ada', subscribed: true },
            { formTitle: 'Contact', submittedAt: '2026-01-01T00:00:00.000Z' }
        );
        expect(tags).toEqual({
            name: 'Ada',
            subscribed: 'Yes',
            formTitle: 'Contact',
            submittedAt: '2026-01-01T00:00:00.000Z',
        });
    });
});

describe('displayValue', () => {
    it.each([
        [null, '—'],
        [undefined, '—'],
        ['', '—'],
        [true, 'Yes'],
        [false, 'No'],
        [['a', 'b'], 'a, b'],
        [[], '—'],
        [42, '42'],
        ['hello', 'hello'],
    ])('%s -> %s', (input, expected) => {
        expect(displayValue(input)).toBe(expected);
    });

    it('renders a Date as an ISO string', () => {
        const date = new Date('2026-01-01T00:00:00.000Z');
        expect(displayValue(date)).toBe('2026-01-01T00:00:00.000Z');
    });

    it('renders a plain object with JSON.stringify', () => {
        expect(displayValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
    });
});

describe('toValueRows', () => {
    it('preserves field order and falls back to name when label is missing', () => {
        const fields = [
            { name: 'name', label: 'Full name' },
            { name: 'email' },
            { name: 'message', label: 'Message' },
        ];
        const rows = toValueRows(fields, { message: 'Hello', name: 'Ada' });
        expect(rows).toEqual([
            { label: 'Full name', value: 'Ada' },
            { label: 'email', value: '—' },
            { label: 'Message', value: 'Hello' },
        ]);
    });

    it('renders a missing value as an em-dash', () => {
        const rows = toValueRows([{ name: 'phone', label: 'Phone' }], {});
        expect(rows).toEqual([{ label: 'Phone', value: '—' }]);
    });
});
