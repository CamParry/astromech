/**
 * Type-intrinsic coerce/validate helpers for the core field types.
 *
 * Pure functions — no DB imports. Consumed by core-field-types.ts.
 */

import type { Field, FieldValidationContext, FieldValidator } from '@/types/fields';
import { isUnsafeHref } from './rich-text/safe-links';
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

/**
 * A slug is stored exactly as `slugify` would write it, so a value that
 * normalization would have to change is rejected rather than rewritten. The
 * suggestion names what the author probably meant.
 */
export const validateSlug: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be text';
    const normalized = slugify(ctx.value);
    if (normalized === ctx.value) return true;
    const suggestion = normalized === '' ? '' : `: try '${normalized}'`;
    return `Must be lowercase letters, numbers and hyphens${suggestion}`;
};

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
 * expanded read would send, and a relationship id whose entry is of a type other
 * than the declared `target`. Whether the id resolves is NOT checked: a dangling
 * id is dropped by the write pipeline, not rejected (decisions/0004).
 */
export const validateReference: FieldValidator = async (ctx) => {
    const many = ctx.field.multiple === true;
    const ids: string[] = [];
    if (!many) {
        if (typeof ctx.value !== 'string') return referenceMessage(ctx.value, false);
        ids.push(ctx.value);
    } else {
        if (!Array.isArray(ctx.value)) return referenceMessage(ctx.value, true);
        for (const item of ctx.value) {
            if (typeof item !== 'string') return referenceMessage(item, true);
            ids.push(item);
        }
    }
    return validateTargetType(ctx, ids);
};

/**
 * Reject an id that resolves to an entry of the wrong type. An id with no entry
 * row is left alone: it is either dangling (the pipeline prunes it later) or
 * held by a storage override this read cannot see, and neither is an error.
 */
async function validateTargetType(
    ctx: FieldValidationContext,
    ids: string[]
): Promise<true | string> {
    const target = ctx.field.target;
    const read = ctx.reads.entryTypes;
    if (ctx.field.type !== 'relationship') return true;
    if (typeof target !== 'string' || target === '') return true;
    if (read === undefined || ids.length === 0) return true;

    const types = await read(ids);
    for (const id of ids) {
        const actual = types.get(id);
        if (actual === undefined || actual === target) continue;
        return `"${ctx.field.name}" expects a ${target}, but "${id}" is a ${actual}`;
    }
    return true;
}

/** Name the populated-object case, since it is the one worth explaining. */
function referenceMessage(value: unknown, many: boolean): string {
    const expected = many ? 'a list of ids' : 'an id';
    if (typeof value === 'object' && value !== null) {
        return `Must be ${expected}, not a populated record`;
    }
    return `Must be ${expected}`;
}

// ---------------------------------------------------------------------------
// text — text, textarea
// ---------------------------------------------------------------------------

export const validateText: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' ? true : 'Must be text';

// ---------------------------------------------------------------------------
// color
// ---------------------------------------------------------------------------

/** The forms the color picker writes and an API caller can reasonably send. */
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOR_RE = /^(?:rgb|rgba|hsl|hsla)\([^()]*\)$/i;

/**
 * A color is a hex value (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or an
 * `rgb()`/`rgba()`/`hsl()`/`hsla()` function. Keywords like `red` are not
 * accepted: the field's editor writes hex, and a typo reads as a keyword.
 */
export const validateColor: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be text';
    const value = ctx.value.trim();
    return HEX_COLOR_RE.test(value) || FUNCTIONAL_COLOR_RE.test(value)
        ? true
        : 'Must be a hex colour such as #3366ff, or an rgb()/hsl() colour';
};

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

/** A relative url is resolved against this to be parsed at all. */
const URL_REFERENCE_BASE = 'https://astromech.invalid/';

/**
 * A link holds `{ url, label, target? }`. The url is checked as a URL
 * reference, so an absolute url, a relative path and an anchor are all valid.
 */
export const validateLink: FieldValidator = async (ctx) => {
    const v = ctx.value;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        return 'Must be a link';
    }
    const { url, label, target } = v as Record<string, unknown>;
    if (typeof url !== 'string') return 'A link needs a url';
    const urlProblem = linkUrlProblem(url);
    if (urlProblem !== null) return urlProblem;
    if (label !== undefined && typeof label !== 'string') {
        return 'A link label must be text';
    }
    if (target !== undefined && typeof target !== 'string') {
        return 'A link target must be text';
    }
    return true;
};

/**
 * What is wrong with a link url, or null. An empty url is unfilled rather than
 * malformed, which is `required`'s question; `javascript:` and `data:` are
 * refused on the same grounds as a rich-text link.
 */
function linkUrlProblem(url: string): string | null {
    if (url === '') return null;
    if (isUnsafeHref(url)) return 'A link may not use a javascript: or data: url';
    if (/\s/.test(url)) return 'Must be a valid URL';
    try {
        new URL(url, URL_REFERENCE_BASE);
        return null;
    } catch {
        return 'Must be a valid URL';
    }
}

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
