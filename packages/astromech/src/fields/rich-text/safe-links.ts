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

/** True for a link mark pointing at a scheme that executes when followed. */
function isUnsafeLink(mark: NonNullable<JSONContent['marks']>[number]): boolean {
    if (mark.type !== 'link') return false;
    const href = mark.attrs?.['href'];
    if (typeof href !== 'string') return false;
    const scheme = href.replace(/[\s\0]/g, '').toLowerCase();
    return scheme.startsWith('javascript:') || scheme.startsWith('data:');
}
