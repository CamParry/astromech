/**
 * Merge tags — the `{{token}}` syntax an author writes into a form's email
 * subject and body, substituted with that submission's values at send time.
 * "Merge tag" is the term the form world uses for this (Gravity Forms,
 * Mailchimp); it is deliberately not "placeholder", which in a form context
 * means a field's greyed-out input hint.
 */

import { displayValue } from './values.js';

// `{{key}}`, tolerating inner whitespace (`{{ key }}`). The captured group
// excludes braces so one match never spans two tokens.
const MERGE_TAG_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Substitute `{{key}}` tags in a template string. Unknown tags are left untouched. */
export function applyMergeTags(template: string, tags: Record<string, string>): string {
    // String#replace makes a single pass over `template` and never rescans
    // replacement text, so a value that itself contains `{{...}}` cannot be
    // re-expanded.
    return template.replace(MERGE_TAG_PATTERN, (match, key: string) => {
        const value = tags[key];
        // An unknown key is left as-is rather than replaced with an empty
        // string — a visibly unsubstituted tag is a better failure signal
        // to the author than silent deletion.
        if (value === undefined) return match;
        // Values are inserted as plain text; React Email escapes them when
        // the result lands in a `Text`/`Section` child, so no HTML-escaping
        // happens here.
        return value;
    });
}

/**
 * Substitute `{{key}}` tags inside a rich-text body's ProseMirror JSON,
 * returning a new document. The caller renders the result.
 *
 * Substituting HERE rather than in the rendered HTML is the whole point. The
 * rendered string goes to `dangerouslySetInnerHTML`, so splicing submitted
 * values into it would land untrusted text past the sanitizer. Rendering
 * happens *after* this, and the renderer escapes text-node content — pinned by
 * `tests/fields/rich-text-escaping.test.ts` in core — so a submitted value
 * containing markup comes out as visible text rather than live HTML.
 *
 * Only the `text` of text nodes is touched. Marks and attrs (a link's `href`,
 * say) are deliberately left alone: a tag there would let a submitted value
 * choose a URL, and there is no reason an email body needs that.
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
