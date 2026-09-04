/**
 * Merge-tag substitution inside a rich-text email body.
 *
 * The security property under test: substitution happens on the ProseMirror
 * JSON, and rendering happens after, so a submitted value containing markup is
 * escaped by the renderer rather than reaching `dangerouslySetInnerHTML` as
 * live HTML.
 */

import { describe, expect, it } from 'vitest';
import { renderRichText } from '@/fields/rich-text/render';
import { applyMergeTagsInRichText } from '../src/notifications/merge-tags';

type Json = Parameters<typeof renderRichText>[0];

function paragraph(text: string) {
    return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
}

describe('applyMergeTagsInRichText', () => {
    it('substitutes a token in a text node', () => {
        const out = applyMergeTagsInRichText(paragraph('Hi {{name}}, thanks.'), {
            name: 'Ada',
        });

        expect(renderRichText(out as Json)).toContain('Hi Ada, thanks.');
    });

    it('leaves an unknown token visible rather than deleting it', () => {
        const out = applyMergeTagsInRichText(paragraph('Hi {{nope}}.'), { name: 'Ada' });

        expect(renderRichText(out as Json)).toContain('{{nope}}');
    });

    it('escapes markup in a substituted value instead of emitting live HTML', () => {
        const out = applyMergeTagsInRichText(paragraph('Hi {{name}}.'), {
            name: '<script>alert(1)</script>',
        });
        const html = renderRichText(out as Json);

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('does not substitute into a link href', () => {
        const doc = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'click',
                            marks: [{ type: 'link', attrs: { href: '{{name}}' } }],
                        },
                    ],
                },
            ],
        };

        const out = applyMergeTagsInRichText(doc, { name: 'https://evil.example' });

        expect(JSON.stringify(out)).toContain('{{name}}');
        expect(JSON.stringify(out)).not.toContain('evil.example');
    });

    it('returns non-object input untouched', () => {
        expect(applyMergeTagsInRichText(null, {})).toBeNull();
        expect(applyMergeTagsInRichText('plain', {})).toBe('plain');
    });

    it('does not mutate the input document', () => {
        const doc = paragraph('Hi {{name}}.');
        const before = JSON.stringify(doc);

        applyMergeTagsInRichText(doc, { name: 'Ada' });

        expect(JSON.stringify(doc)).toBe(before);
    });
});
