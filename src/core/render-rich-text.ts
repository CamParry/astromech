/**
 * Rich-text render helper — JSON → HTML string.
 *
 * Uses @tiptap/static-renderer (DOM-free, Cloudflare-Worker-safe).
 * The same shared extensions from rich-text-extensions are used here
 * and in the editor, so they cannot drift.
 *
 * Called by the public-shape projection in visibility.ts.
 */

import { renderToHTMLString } from '@tiptap/static-renderer';
import type { JSONContent } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';
import { buildRichTextExtensions } from '@/support/rich-text-extensions.js';

// ============================================================================
// Sanitization
// ============================================================================

/** Strip dangerous href schemes and inline event handlers from an HTML string. */
function sanitize(html: string): string {
    // Strip javascript: and data: hrefs (case-insensitive, with optional whitespace/encoding).
    let result = html.replace(
        /(<a[^>]*\s)href\s*=\s*(?:"([^"]*)"|\s*'([^']*)'|([^\s>]*))/gi,
        (
            _match,
            prefix: string,
            dq: string | undefined,
            sq: string | undefined,
            uq: string | undefined
        ) => {
            const href = (dq ?? sq ?? uq ?? '').trim();
            const scheme = href.replace(/[\s\0]/g, '').toLowerCase();
            if (scheme.startsWith('javascript:') || scheme.startsWith('data:')) {
                return `${prefix}href="#"`;
            }
            return _match;
        }
    );

    // Strip event-handler attributes (on*=…).
    result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    return result;
}

// ============================================================================
// Render
// ============================================================================

/**
 * Render a ProseMirror JSON document to a sanitized HTML string.
 *
 * Safe to call in Cloudflare Workers (no DOM dependency).
 * Returns an empty string for null/undefined input.
 */
export function renderRichText(
    json: JSONContent | null | undefined,
    allow?: RichTextAllow
): string {
    if (json === null || json === undefined) return '';

    const extensions = buildRichTextExtensions(allow);

    let html: string;
    try {
        html = renderToHTMLString({ content: json, extensions });
    } catch {
        return '';
    }

    return sanitize(html);
}
