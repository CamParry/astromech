/**
 * Type-intrinsic coerce/validate helpers for the core field types.
 *
 * Pure functions — no DB imports. Consumed by core-field-types.ts.
 */

import type { DataField, FieldValidationContext, FieldValidator } from '@/types/fields';
import { z } from 'zod';
import { isRecord } from '@/utilities/is-record';
import { slugify } from '@/utilities/strings';
import { isUnsafeHref } from './rich-text/safe-links';

// email

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const coerceEmail = (value: unknown): unknown =>
    typeof value === 'string' ? value.trim() : value;
export const validateEmail: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' && EMAIL_RE.test(ctx.value)
        ? true
        : 'Must be a valid email address';

// url

export const coerceUrl = (value: unknown): unknown =>
    typeof value === 'string' ? value.trim() : value;
export const validateUrl: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be a valid URL';
    try {
        new URL(ctx.value);
        return true;
    } catch {
        return 'Must be a valid URL';
    }
};

// slug

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

// json

/** Recursive JSON-shape guard. Rejects functions/undefined/symbols/bigint and non-finite numbers. */
export function isJsonValue(value: unknown): boolean {
    if (value === null) return true;
    if (typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isJsonValue);
    if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).every(isJsonValue);
    }
    return false;
}

export const validateJson: FieldValidator = async (ctx) =>
    isJsonValue(ctx.value) ? true : 'Must be valid JSON';

// key-value

export const coerceKeyValue = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const out: Record<string, string> = {};
    for (const [key, pairValue] of Object.entries(value)) {
        if (key === '' || pairValue === null || pairValue === undefined) continue;
        out[key] = typeof pairValue === 'string' ? pairValue : String(pairValue);
    }
    return out;
};

export const validateKeyValue: FieldValidator = async (ctx) => {
    const value = ctx.value;
    return isRecord(value) ? true : 'Must be a set of key/value pairs';
};

// choice — select, radio-group, multiselect, checkbox-group

/** The field's declared option values, as a set. */
function optionValues(field: DataField): Set<string> {
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

// number — number, range

/**
 * Parse a numeric string, since an HTML form posts every value as text.
 * A string that is not a number is left alone for the validator to reject.
 */
export const coerceNumber = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
};

export const validateNumber: FieldValidator = async (ctx) =>
    typeof ctx.value === 'number' && Number.isFinite(ctx.value)
        ? true
        : 'Must be a number';

// boolean

export const validateBoolean: FieldValidator = async (ctx) =>
    typeof ctx.value === 'boolean' ? true : 'Must be true or false';

// date, datetime
//
// Both are stored in ISO 8601 forms that sort as text in time order, so a list
// sorted by the field needs no per-type SQL: a date as `YYYY-MM-DD`, a
// date-time with a zone as UTC to the millisecond, and one without a zone as
// written. A value without a zone sorts as if it were UTC.

const isoDate = z.iso.date();
const isoDatetime = z.iso.datetime({ offset: true, local: true });

/** The zone a date-time ends with: `Z` or an offset such as `+02:00`. */
const ZONE_RE = /(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * A basic-format offset, `+0200`, which `z.iso.datetime` refuses. Core stored
 * any value `Date.parse` read before it kept these forms, so a row can hold one.
 */
const BASIC_OFFSET_RE = /([+-]\d{2})(\d{2})$/;

/** `value` with a basic-format offset written as `+02:00`, the form the ISO check reads. */
const withExtendedOffset = (value: string): string =>
    value.replace(BASIC_OFFSET_RE, '$1:$2');

/** A fraction of a second past milliseconds, which a `Date` cannot hold. */
const SUB_MILLISECOND_RE = /(\.\d{3})\d+$/;

const isValidDate = (value: unknown): value is Date =>
    value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Callers pass a `Date` as often as a string. A `Date` becomes its UTC date,
 * the day `new Date('YYYY-MM-DD')` reads back. An ISO date-time string, the
 * form a date was stored in before core kept `YYYY-MM-DD` only, becomes the
 * date it is written with: `2026-10-10T23:30:00-05:00`, or `-0500`, is
 * 2026-10-10 where it was written, though the same instant falls on 2026-10-11
 * in UTC. Any other string is left for the validator.
 */
export const coerceDate = (value: unknown): unknown => {
    if (isValidDate(value)) return value.toISOString().slice(0, 10);
    return typeof value === 'string' &&
        isoDatetime.safeParse(withExtendedOffset(value)).success
        ? value.slice(0, 10)
        : value;
};

/**
 * A date is stored as `YYYY-MM-DD`. This also accepts an ISO date-time, with
 * either offset form, the form a date was stored in before, because a patch
 * validates the fields it leaves out without coercing them: such a value
 * reaches this rule only when it is stored and not sent, and refusing it would
 * fail every patch to the row until a caller sent the date again. A sent one
 * is coerced to its date first.
 */
export const validateDate: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be a date';
    return isoDate.safeParse(ctx.value).success ||
        isoDatetime.safeParse(withExtendedOffset(ctx.value)).success
        ? true
        : 'Must be a date as YYYY-MM-DD';
};

/**
 * A `Date`, or a string with a zone, is stored as UTC to the millisecond:
 * `2026-10-10T10:00:00+02:00` and `2026-10-10T10:00:00+0200` become
 * `2026-10-10T08:00:00.000Z`. A string without a zone keeps its wall time, cut
 * to the millisecond, and a bare date is kept as it is. Anything else is left
 * for the validator to reject.
 */
export const coerceDatetime = (value: unknown): unknown => {
    if (isValidDate(value)) return value.toISOString();
    if (typeof value !== 'string') return value;
    const extended = withExtendedOffset(value);
    if (!isoDatetime.safeParse(extended).success) return value;
    return ZONE_RE.test(extended)
        ? new Date(extended).toISOString()
        : extended.replace(SUB_MILLISECOND_RE, '$1');
};

/**
 * An ISO 8601 date and time, with or without a zone, or a bare date. This also
 * accepts a basic-format offset (`+0200`), because a patch validates the fields
 * it leaves out without coercing them: such a value reaches this rule only when
 * it is stored and not sent, and refusing it would fail every patch to the row
 * until a caller sent the field again. A sent one is coerced to UTC first.
 */
export const validateDatetime: FieldValidator = async (ctx) => {
    if (typeof ctx.value !== 'string') return 'Must be a date and time';
    return isoDatetime.safeParse(withExtendedOffset(ctx.value)).success ||
        isoDate.safeParse(ctx.value).success
        ? true
        : 'Must be an ISO 8601 date and time, such as 2026-10-10T14:30';
};

// reference — media, relationship

/**
 * A reference is stored as an id, or a list of ids when `multiple`.
 * Rejects a populated entry object, which is what a caller writing back an
 * expanded read would send, and a relationship id whose entry is of a type other
 * than the declared `target`. Whether the id resolves is NOT checked: a dangling
 * id is dropped by the write pipeline, not rejected
 * (`decisions/relationships-is-a-derived-index.md`).
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
 * held by a repository override this read cannot see, and neither is an error.
 */
async function validateTargetType(
    ctx: FieldValidationContext,
    ids: string[]
): Promise<true | string> {
    const target = ctx.field.target;
    const read = ctx.entryTypes;
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

// text — text, textarea

export const validateText: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' ? true : 'Must be text';

// color

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

// link

/** A relative url is resolved against this to be parsed at all. */
const URL_REFERENCE_BASE = 'https://astromech.invalid/';

/**
 * A link holds `{ url, label, target? }`. The url is checked as a URL
 * reference, so an absolute url, a relative path and an anchor are all valid.
 */
export const validateLink: FieldValidator = async (ctx) => {
    const value = ctx.value;
    if (!isRecord(value)) return 'Must be a link';
    const { url, label, target } = value;
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

// nested fields — group, repeater, blocks, tree

/** A group holds one object of child values. */
export const validateGroup: FieldValidator = async (ctx) => {
    const value = ctx.value;
    return isRecord(value) ? true : 'Must be a group of fields';
};

/** Repeaters, blocks and trees all hold a list of items. */
export const validateItemList: FieldValidator = async (ctx) =>
    Array.isArray(ctx.value) ? true : 'Must be a list of items';
