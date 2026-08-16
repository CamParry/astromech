/**
 * The package name as a literal, needed because `definePluginTable` takes it as
 * a *type* to derive `plugin_forms_*` names. Identity itself is declared in
 * `index.ts`; keep this the only other place naming it.
 */

import type { SpamProvider } from './spam/types';

export const FORMS_PACKAGE = '@astromech/forms';

export const FORM_TYPE = 'form';

export const SUBMISSION_TYPE = 'submission';

export type FormsOptions = {
    /** A spam provider such as `turnstile(...)`, or your own. */
    spam?: SpamProvider;
    /** Store ip / userAgent / referer on each submission. Default true. */
    storeMeta?: boolean;
    /**
     * Submissions allowed per connecting address per window, counted in
     * process. Default 20 per minute; `false` turns the limit off. A caller
     * with no connecting address — CLI, MCP, in-process — is not limited.
     */
    rateLimit?: { limit: number; windowMs: number } | false;
};

/** The twelve field kinds a form's `fields` blocks compose from. */
export const FORM_FIELD_KINDS = [
    'text',
    'textarea',
    'email',
    'tel',
    'url',
    'number',
    'select',
    'radio',
    'checkbox',
    'checkboxGroup',
    'date',
    'hidden',
] as const;

export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

/**
 * Tolerant shape of one stored `fields` block instance on a `form` entry.
 * `_type`, `_id` and `_disabled` are core's reserved keys; the rest is per-kind
 * author config. Everything is `unknown` — callers narrow on `_type` first.
 */
export type StoredFormField = {
    _type?: unknown;
    _id?: unknown;
    _disabled?: unknown;
    name?: unknown;
    label?: unknown;
    required?: unknown;
    helpText?: unknown;
    placeholder?: unknown;
    minLength?: unknown;
    maxLength?: unknown;
    min?: unknown;
    max?: unknown;
    options?: unknown;
    rows?: unknown;
    defaultValue?: unknown;
    [key: string]: unknown;
};

/**
 * Request metadata stored alongside a submission. Explicit `| undefined` to
 * match what the published Zod schema's `.optional()` widens to.
 */
export type SubmissionMeta = {
    ip?: string | undefined;
    userAgent?: string | undefined;
    referer?: string | undefined;
};
