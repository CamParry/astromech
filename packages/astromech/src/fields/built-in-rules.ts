/**
 * Type-intrinsic coerce/validate helpers for core field descriptors.
 *
 * Pure functions — no DB imports. Consumed by core-descriptors.ts.
 */

import type { FieldValidator } from '@/types/fields.js';
import { slugify } from '@/utilities/strings.js';

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const coerceEmail = (v: unknown): unknown => (typeof v === 'string' ? v.trim() : v);
export const validateEmail: FieldValidator = async (ctx) =>
    typeof ctx.value === 'string' && EMAIL_RE.test(ctx.value) ? true : 'Must be a valid email address';

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

export const coerceSlug = (v: unknown): unknown => (typeof v === 'string' ? slugify(v) : v);
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
