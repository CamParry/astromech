/**
 * Merge tags — the `{{token}}` syntax an author writes into a form's email
 * subject and body, substituted with that submission's values at send time.
 */

import { displayValue } from './values.js';

/** `{{key}}`, tolerating inner whitespace. The group excludes the braces. */
const MERGE_TAG_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Substitute `{{key}}` tags in a template string. An unknown key is left
 * visible rather than blanked, so the author can see what failed.
 */
export function applyMergeTags(template: string, tags: Record<string, string>): string {
    return template.replace(MERGE_TAG_PATTERN, (match, key: string) => {
        const value = tags[key];
        if (value === undefined) return match;
        return value;
    });
}

/**
 * Substitute `{{key}}` tags in a rich-text body's ProseMirror JSON, returning a
 * new document for the caller to render. Runs before rendering so the renderer
 * still escapes substituted values; marks and attrs are left untouched.
 */
export function applyMergeTagsInRichText(
    node: unknown,
    tags: Record<string, string>
): unknown {
    if (Array.isArray(node)) {
        return node.map((child) => applyMergeTagsInRichText(child, tags));
    }
    if (typeof node !== 'object' || node === null) return node;

    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = { ...source };

    if (source['type'] === 'text' && typeof source['text'] === 'string') {
        result['text'] = applyMergeTags(source['text'], tags);
    }
    if (Array.isArray(source['content'])) {
        result['content'] = applyMergeTagsInRichText(source['content'], tags);
    }
    return result;
}

/** Flatten a submission into the merge tags available to subjects and bodies. */
export function mergeTagValues(
    data: Record<string, unknown>,
    extra: { formTitle: string; submittedAt: string }
): Record<string, string> {
    const tags: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
        tags[key] = displayValue(value);
    }
    tags.formTitle = extra.formTitle;
    tags.submittedAt = extra.submittedAt;
    return tags;
}
