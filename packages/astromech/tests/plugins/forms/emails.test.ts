/**
 * Pure-logic tests for the forms plugin's email helpers: placeholder
 * substitution and answer-row shaping. No DB, no `PluginContext`, no
 * component rendering — those belong to a later slice.
 */

import { describe, expect, it } from 'vitest';
import {
    applyPlaceholders,
    displayValue,
    submissionVars,
    toAnswerRows,
} from '@astromech/forms/emails';

describe('applyPlaceholders', () => {
    it('substitutes a known token', () => {
        expect(applyPlaceholders('Hi {{name}}!', { name: 'Ada' })).toBe('Hi Ada!');
    });

    it('leaves an unknown token intact rather than deleting it', () => {
        expect(applyPlaceholders('Hi {{name}}!', {})).toBe('Hi {{name}}!');
    });

    it('tolerates inner whitespace around the key', () => {
        expect(applyPlaceholders('Hi {{ name }}!', { name: 'Ada' })).toBe('Hi Ada!');
    });

    it('does not re-expand a replacement value that itself contains {{...}}', () => {
        expect(applyPlaceholders('Body: {{body}}', { body: '{{name}}' })).toBe(
            'Body: {{name}}'
        );
    });
});

describe('submissionVars', () => {
    it('flattens submitted data plus formTitle/submittedAt into string tokens', () => {
        const vars = submissionVars(
            { name: 'Ada', subscribed: true },
            { formTitle: 'Contact', submittedAt: '2026-01-01T00:00:00.000Z' }
        );
        expect(vars).toEqual({
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

describe('toAnswerRows', () => {
    it('preserves field order and falls back to name when label is missing', () => {
        const fields = [
            { name: 'name', label: 'Full name' },
            { name: 'email' },
            { name: 'message', label: 'Message' },
        ];
        const rows = toAnswerRows(fields, { message: 'Hello', name: 'Ada' });
        expect(rows).toEqual([
            { label: 'Full name', value: 'Ada' },
            { label: 'email', value: '—' },
            { label: 'Message', value: 'Hello' },
        ]);
    });

    it('renders a missing answer as an em-dash', () => {
        const rows = toAnswerRows([{ name: 'phone', label: 'Phone' }], {});
        expect(rows).toEqual([{ label: 'Phone', value: '—' }]);
    });
});
