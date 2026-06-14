/**
 * Config-time `Label` helpers — runtime-agnostic, no i18next dependency.
 *
 * Config never translates; it captures keys via `t(key)` → `{ $t }`. The
 * admin-side resolver that turns a `Label` into a display string against
 * i18next lives separately in `@/admin/i18n/labels.ts`.
 */

import type { Label, MessageDescriptor } from '@/types/fields.js';
import { slugify } from './strings.js';

/** Capture an i18n key as a serializable descriptor (`resolveLabel` resolves it). */
export function t(key: string): MessageDescriptor {
    return { $t: key };
}

/**
 * Derive a machine-name slug from a `Label` (a literal string or a `{ $t }`
 * key descriptor). Falls back to `fallback` when the source slugifies to empty.
 */
export function labelToSlug(label: Label, fallback = 'section'): string {
    const source = typeof label === 'string' ? label : label.$t;
    return slugify(source) || fallback;
}
