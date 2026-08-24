/**
 * Rich-text render helper — JSON → HTML string via `@tiptap/static-renderer`
 * (DOM-free, Worker-safe). Shares extensions with the editor so they cannot
 * drift. Called by the public-shape projection in `visibility.ts`.
 */

import type { RichTextAllow } from '@/types/fields';
import type { JSONContent } from '@tiptap/core';
import { renderToHTMLString } from '@tiptap/static-renderer';
import { buildRichTextExtensions } from './extensions';
import { isUnsafeHref } from './safe-links';

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
            if (isUnsafeHref(href)) {
                return `${prefix}href="#"`;
            }
            return _match;
        }
    );

    // Strip event-handler attributes (on*=…).
    result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Style allow-list: keep only text-align and text-wrap declarations.
    // Removes the entire style attribute if nothing safe remains.
    result = result.replace(
        /\sstyle\s*=\s*"([^"]*)"/gi,
        (_match, declarations: string) => {
            const safe = declarations
                .split(';')
                .map((d) => d.trim())
                .filter((d) => /^text-(?:align|wrap)\s*:/i.test(d))
                .join('; ');
            return safe.length > 0 ? ` style="${safe}"` : '';
        }
    );

    return result;
}

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
