/**
 * Link-scheme guard for rich-text documents.
 *
 * `renderRichText` sanitizes on the way out, but a full-shape read hands the
 * JSON straight to a consumer that renders it itself.
 */

import type { JSONContent } from '@tiptap/core';

/**
 * Drop `link` marks whose href resolves to a `javascript:` or `data:` scheme,
 * returning a new document rather than mutating the input.
 */
export function stripUnsafeLinks(node: JSONContent): JSONContent {
    const result: JSONContent = { ...node };

    if (Array.isArray(node.marks)) {
        const marks = node.marks.filter((mark) => !isUnsafeLink(mark));
        if (marks.length > 0) result.marks = marks;
        else delete result.marks;
    }

    if (Array.isArray(node.content)) {
        result.content = node.content.map(stripUnsafeLinks);
    }

    return result;
}

/**
 * Return the first unsafe link href in the document, depth-first, or null.
 * Validation rejects rather than strips, so it needs the offending value.
 */
export function findUnsafeLink(node: JSONContent): string | null {
    if (Array.isArray(node.marks)) {
        for (const mark of node.marks) {
            const href: unknown = mark.attrs?.['href'];
            if (mark.type === 'link' && typeof href === 'string' && isUnsafeHref(href)) {
                return href;
            }
        }
    }

    if (Array.isArray(node.content)) {
        for (const child of node.content) {
            const found = findUnsafeLink(child);
            if (found !== null) return found;
        }
    }

    return null;
}

/** True for an href whose scheme executes when followed. */
export function isUnsafeHref(href: unknown): boolean {
    if (typeof href !== 'string') return false;
    const scheme = href.replace(/[\s\0]/g, '').toLowerCase();
    return scheme.startsWith('javascript:') || scheme.startsWith('data:');
}

/** True for a link mark pointing at a scheme that executes when followed. */
function isUnsafeLink(mark: NonNullable<JSONContent['marks']>[number]): boolean {
    if (mark.type !== 'link') return false;
    return isUnsafeHref(mark.attrs?.['href']);
}
