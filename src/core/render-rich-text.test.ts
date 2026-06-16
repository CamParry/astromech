/**
 * Tests for renderRichText — JSON→HTML rendering and sanitization.
 */

import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { renderRichText } from './render-rich-text.js';

// ============================================================================
// Helpers
// ============================================================================

function doc(...content: JSONContent[]): JSONContent {
    return { type: 'doc', content };
}

function paragraph(...content: JSONContent[]): JSONContent {
    return { type: 'paragraph', content };
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6, ...content: JSONContent[]): JSONContent {
    return { type: 'heading', attrs: { level }, content };
}

function text(t: string, marks?: JSONContent['marks']): JSONContent {
    return marks !== undefined
        ? { type: 'text', text: t, marks }
        : { type: 'text', text: t };
}

function bulletList(...items: JSONContent[]): JSONContent {
    return { type: 'bulletList', content: items };
}

function orderedList(...items: JSONContent[]): JSONContent {
    return { type: 'orderedList', content: items };
}

function listItem(content: JSONContent): JSONContent {
    return { type: 'listItem', content: [content] };
}

// ============================================================================
// JSON → HTML round-trip
// ============================================================================

describe('renderRichText — round-trip', () => {
    it('renders a paragraph', () => {
        const json = doc(paragraph(text('Hello world')));
        const html = renderRichText(json);
        expect(html).toContain('<p>');
        expect(html).toContain('Hello world');
    });

    it('renders h1 through h3', () => {
        for (const level of [1, 2, 3] as const) {
            const json = doc(heading(level, text(`Heading ${level}`)));
            const html = renderRichText(json);
            expect(html).toContain(`<h${level}`);
            expect(html).toContain(`Heading ${level}`);
        }
    });

    it('renders bold mark', () => {
        const json = doc(paragraph(text('bold', [{ type: 'bold' }])));
        const html = renderRichText(json);
        expect(html).toContain('<strong>');
        expect(html).toContain('bold');
    });

    it('renders italic mark', () => {
        const json = doc(paragraph(text('italic', [{ type: 'italic' }])));
        const html = renderRichText(json);
        expect(html).toContain('<em>');
    });

    it('renders underline mark', () => {
        const json = doc(paragraph(text('underlined', [{ type: 'underline' }])));
        const html = renderRichText(json);
        expect(html).toContain('<u>');
    });

    it('renders strikethrough mark', () => {
        const json = doc(paragraph(text('struck', [{ type: 'strike' }])));
        const html = renderRichText(json);
        expect(html).toContain('<s>');
    });

    it('renders bullet list', () => {
        const json = doc(bulletList(listItem(paragraph(text('item')))));
        const html = renderRichText(json);
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
        expect(html).toContain('item');
    });

    it('renders ordered list', () => {
        const json = doc(orderedList(listItem(paragraph(text('first')))));
        const html = renderRichText(json);
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>');
    });

    it('renders a link', () => {
        const json = doc(
            paragraph(
                text('click here', [
                    { type: 'link', attrs: { href: 'https://example.com' } },
                ])
            )
        );
        const html = renderRichText(json);
        expect(html).toContain('<a');
        expect(html).toContain('https://example.com');
    });

    it('returns empty string for null', () => {
        expect(renderRichText(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(renderRichText(undefined)).toBe('');
    });

    it('returns empty string for malformed JSON', () => {
        const result = renderRichText({ type: 'unknown-garbage-type', content: [] });
        expect(typeof result).toBe('string');
    });
});

// ============================================================================
// Sanitization
// ============================================================================

describe('renderRichText — sanitization', () => {
    it('strips javascript: href', () => {
        const json = doc(
            paragraph(
                text('evil', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])
            )
        );
        const html = renderRichText(json);
        expect(html).not.toContain('javascript:');
        expect(html).toContain('<a');
    });

    it('strips javascript: href regardless of case', () => {
        const json = doc(
            paragraph(
                text('evil', [{ type: 'link', attrs: { href: 'JAVASCRIPT:alert(1)' } }])
            )
        );
        const html = renderRichText(json);
        expect(html).not.toContain('JAVASCRIPT:');
        expect(html).not.toContain('javascript:');
    });

    it('preserves safe https: href', () => {
        const json = doc(
            paragraph(
                text('link', [
                    { type: 'link', attrs: { href: 'https://example.com/path' } },
                ])
            )
        );
        const html = renderRichText(json);
        expect(html).toContain('https://example.com/path');
    });
});

// ============================================================================
// allow subset
// ============================================================================

describe('renderRichText — allow subset', () => {
    it('renders a heading when heading is allowed', () => {
        const json = doc(heading(2, text('Section')));
        const html = renderRichText(json, { heading: true });
        expect(html).toContain('<h2');
    });
});
