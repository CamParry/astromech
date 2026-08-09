/**
 * Type-intrinsic coerce/validate helpers for the core field types.
 *
 * Pure functions — no DB imports. Consumed by core-field-types.ts.
 */

import type { Field, FieldValidator } from '@/types/fields';
import { slugify } from '@/utilities/strings';

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const coerceEmail = (v: unknown): unknown =>
    typeof v === 'string' ? v.trim() : v;
export const validateEmail: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' && EMAIL_RE.test(ctx.value)
        ? true
        : 'Must be a valid email address';

// ---------------------------------------------------------------------------
// url
// ---------------------------------------------------------------------------

export const coerceUrl = (v: unknown): unknown => (typeof v === 'string' ? v.trim() : v);
export const validateUrl: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be a valid URL';
    try {
        new URL(ctx.value);
        return true;
    } catch {
        return 'Must be a valid URL';
    }
};

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

export const coerceSlug = (v: unknown): unknown =>
    typeof v === 'string' ? slugify(v) : v;
// No slug validator: coerce normalises to a valid slug (or '' which the pipeline treats as empty).

// ---------------------------------------------------------------------------
// json
// ---------------------------------------------------------------------------

/** Recursive JSON-shape guard. Rejects functions/undefined/symbols/bigint and non-finite numbers. */
export function isJsonValue(v: unknown): boolean {
    if (v === null) return true;
    if (typeof v === 'string' || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (Array.isArray(v)) return v.every(isJsonValue);
    if (typeof v === 'object') {
        return Object.values(v as Record<string, unknown>).every(isJsonValue);
    }
    return false;
}

export const validateJson: FieldValidator = async (ctx) =>
    isJsonValue(ctx.value) ? true : 'Must be valid JSON';

// ---------------------------------------------------------------------------
// key-value
// ---------------------------------------------------------------------------

export const coerceKeyValue = (v: unknown): unknown => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === '' || val === null || val === undefined) continue;
        out[k] = typeof val === 'string' ? val : String(val);
    }
    return out;
};

export const validateKeyValue: FieldValidator = async (ctx) => {
    const v = ctx.value;
    return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? true
        : 'Must be a set of key/value pairs';
};

// ---------------------------------------------------------------------------
// choice — select, radio-group, multiselect, checkbox-group
// ---------------------------------------------------------------------------

/** The field's declared option values, as a set. */
function optionValues(field: Field): Set<string> {
    const options = field.options ?? [];
    return new Set(options.map((o) => (typeof o === 'string' ? o : o.value)));
}

/**
 * A single-choice value must be one of the field's declared options.
 * A field that declares none has nothing to check against, so it passes.
 */
export const validateChoice: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be one of the available options';
    const allowed = optionValues(ctx.field);
    if (allowed.size === 0) return true;
    return allowed.has(ctx.value) ? true : 'Must be one of the available options';
};

/** A multi-choice value must be a list drawn from the field's declared options. */
export const validateMultiChoice: FieldValidator = async (ctx) => {
    if (!Array.isArray(ctx.value)) return 'Must be a list of options';
    const allowed = optionValues(ctx.field);
    for (const item of ctx.value) {
        if (typeof item !== 'string') return 'Must be a list of options';
        if (allowed.size > 0 && !allowed.has(item)) {
            return 'Must be one of the available options';
        }
    }
    return true;
};

// ---------------------------------------------------------------------------
// number — number, range
// ---------------------------------------------------------------------------

/**
 * Parse a numeric string, since an HTML form posts every value as text.
 * A string that is not a number is left alone for the validator to reject.
 */
export const coerceNumber = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : v;
};

export const validateNumber: FieldValidator = async (ctx) =>
    typeof ctx.value === 'number' && Number.isFinite(ctx.value)
        ? true
        : 'Must be a number';

// ---------------------------------------------------------------------------
// boolean
// ---------------------------------------------------------------------------

export const validateBoolean: FieldValidator = async (ctx) =>
    typeof ctx.value === 'boolean' ? true : 'Must be true or false';

// ---------------------------------------------------------------------------
// date, datetime
// ---------------------------------------------------------------------------

/**
 * Callers pass a `Date` as often as a string. Both land in a JSON column as an
 * ISO string, so normalise here and let the validator deal only in strings.
 */
export const coerceDate = (v: unknown): unknown =>
    v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString() : v;

/** Dates are stored as strings, so this checks the string actually parses. */
export const validateDate: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be a date';
    return Number.isNaN(Date.parse(ctx.value)) ? 'Must be a valid date' : true;
};

// ---------------------------------------------------------------------------
// reference — media, relationship
// ---------------------------------------------------------------------------

/**
 * A reference is stored as an id, or a list of ids when `multiple`.
 * Rejects a populated entry object, which is what a caller writing back an
 * expanded read would send. Whether the id resolves is not checked here.
 */
export const validateReference: FieldValidator = async (ctx) => {
    const many = ctx.field.multiple === true;
    if (!many) {
        return typeof ctx.value === 'string' ? true : referenceMessage(ctx.value, false);
    }
    if (!Array.isArray(ctx.value)) return referenceMessage(ctx.value, true);
    for (const item of ctx.value) {
        if (typeof item !== 'string') return referenceMessage(item, true);
    }
    return true;
};

/** Name the populated-object case, since it is the one worth explaining. */
function referenceMessage(value: unknown, many: boolean): string {
    const expected = many ? 'a list of ids' : 'an id';
    if (typeof value === 'object' && value !== null) {
        return `Must be ${expected}, not a populated record`;
    }
    return `Must be ${expected}`;
}

// ---------------------------------------------------------------------------
// text — text, textarea, slug, color
// ---------------------------------------------------------------------------

export const validateText: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' ? true : 'Must be text';

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

/**
 * A link holds `{ url, label, target? }`. Only the shape is checked — the url
 * is not parsed, so a `link` is free to hold a relative path or an anchor.
 */
export const validateLink: FieldValidator = async (ctx) => {
    const v = ctx.value;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        return 'Must be a link';
    }
    const { url, label, target } = v as Record<string, unknown>;
    if (typeof url !== 'string') return 'A link needs a url';
    if (label !== undefined && typeof label !== 'string') {
        return 'A link label must be text';
    }
    if (target !== undefined && typeof target !== 'string') {
        return 'A link target must be text';
    }
    return true;
};

// ---------------------------------------------------------------------------
// nested fields — group, repeater, blocks, tree
// ---------------------------------------------------------------------------

/** A group holds one object of child values. */
export const validateGroup: FieldValidator = async (ctx) => {
    const v = ctx.value;
    return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? true
        : 'Must be a group of fields';
};

/** Repeaters, blocks and trees all hold a list of items. */
export const validateItemList: FieldValidator = async (ctx) =>
    Array.isArray(ctx.value) ? true : 'Must be a list of items';
