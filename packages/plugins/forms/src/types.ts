/**
 * The package name, as a literal.
 *
 * Identity is declared in `index.ts` alongside the rest of the definition;
 * this const exists only because `definePluginTable` needs the package as a
 * *type* to derive `plugin_forms_*` table names for `PluginDB`, and a value
 * inside the definition can't reach a module-scope descriptor. It is the one
 * thing in this package that names its identity outside `index.ts` — keep it
 * that way.
 */
export const FORMS_PACKAGE = '@astromech/forms';

export const FORM_TYPE = 'form';

export const SUBMISSION_TYPE = 'submission';

export type FormsOptions = {
    spam?: SpamOptions;
    /** Store ip / userAgent / referer on each submission. Default true. */
    storeMeta?: boolean;
};

export type SpamOptions = {
    provider: 'turnstile' | 'recaptcha';
    siteKey: string;
    /** Read from `import.meta.env` in the site's config — never stored in content. */
    secretKey: string;
    /** reCAPTCHA v3 only. Default 0.5. */
    minScore?: number;
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
 *
 * `_type`, `_id` and `_disabled` are core's reserved block-instance keys (the
 * author-side block schema uses `type` instead); everything else is the
 * author's per-kind config. Values are typed `unknown` because this is
 * untrusted stored JSON — callers narrow per `_type` before use.
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

export type SubmissionMeta = {
    ip?: string;
    userAgent?: string;
    referer?: string;
};
