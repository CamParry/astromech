import { displayValue } from './answers.js';

// `{{key}}`, tolerating inner whitespace (`{{ key }}`). The captured group
// excludes braces so one match never spans two tokens.
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Substitute `{{key}}` tokens in a template string. Unknown tokens are left untouched. */
export function applyPlaceholders(
    template: string,
    vars: Record<string, string>
): string {
    // String#replace makes a single pass over `template` and never rescans
    // replacement text, so a value that itself contains `{{...}}` cannot be
    // re-expanded.
    return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
        const value = vars[key];
        // An unknown key is left as-is rather than replaced with an empty
        // string — a visibly unsubstituted token is a better failure signal
        // to the author than silent deletion.
        if (value === undefined) return match;
        // Values are inserted as plain text; React Email escapes them when
        // the result lands in a `Text`/`Section` child, so no HTML-escaping
        // happens here.
        return value;
    });
}

/**
 * Substitute `{{key}}` tokens inside a rich-text body's ProseMirror JSON,
 * returning a new document. The caller renders the result.
 *
 * Substituting HERE rather than in the rendered HTML is the whole point. The
 * rendered string goes to `dangerouslySetInnerHTML`, so splicing submitted
 * answers into it would land untrusted text past the sanitizer. Rendering
 * happens *after* this, and the renderer escapes text-node content — pinned by
 * `tests/fields/rich-text-escaping.test.ts` in core — so an answer containing
 * markup comes out as visible text rather than live HTML.
 *
 * Only the `text` of text nodes is touched. Marks and attrs (a link's `href`,
 * say) are deliberately left alone: a token there would let a submitted value
 * choose a URL, and there is no reason an email body needs that.
 */
export function substituteInRichText(
    node: unknown,
    vars: Record<string, string>
): unknown {
    if (Array.isArray(node)) {
        return node.map((child) => substituteInRichText(child, vars));
    }
    if (typeof node !== 'object' || node === null) return node;

    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = { ...source };

    if (source['type'] === 'text' && typeof source['text'] === 'string') {
        result['text'] = applyPlaceholders(source['text'], vars);
    }
    if (Array.isArray(source['content'])) {
        result['content'] = substituteInRichText(source['content'], vars);
    }
    return result;
}

/** Flatten a submission into the `{{token}}` variables available to subjects and bodies. */
export function submissionVars(
    data: Record<string, unknown>,
    extra: { formTitle: string; submittedAt: string }
): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
        vars[key] = displayValue(value);
    }
    vars.formTitle = extra.formTitle;
    vars.submittedAt = extra.submittedAt;
    return vars;
}
