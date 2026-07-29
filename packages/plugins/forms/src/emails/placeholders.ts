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
