/**
 * The escaping guarantee that `@astromech/forms` relies on.
 *
 * Forms substitutes submitted answers into an email body's ProseMirror JSON
 * *before* rendering, rather than into the rendered HTML string — splicing
 * untrusted text into already-sanitized HTML would land it past the sanitizer.
 * That is only safe if the renderer escapes text-node content, so this pins
 * the behaviour rather than trusting it.
 */

import { describe, expect, it } from 'vitest';
import { renderRichText } from '@/fields/rich-text/index';

function doc(text: string) {
    return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
}

describe('renderRichText text-node escaping', () => {
    it('escapes markup in text content rather than emitting it', () => {
        const html = renderRichText(doc('<script>alert(1)</script>'));

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('escapes an img tag with an inline error handler', () => {
        const html = renderRichText(doc('<img src=x onerror="alert(1)">'));

        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror=');
    });

    it('escapes a bare angle bracket and ampersand', () => {
        const html = renderRichText(doc('a < b && c > d'));

        expect(html).toContain('&lt;');
        expect(html).toContain('&amp;');
    });
});
