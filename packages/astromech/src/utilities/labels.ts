/**
 * Config-time `Label` helpers — runtime-agnostic, no i18next dependency.
 *
 * Config never translates; it captures keys via `t(key)` → `{ $t }`. The
 * admin-side resolver that turns a `Label` into a display string against
 * i18next lives separately in `@/admin/i18n/labels.ts`.
 */

import type { Label, MessageRef } from '@/types/fields';
import { startCase } from 'lodash-es';
import { slugify } from './strings';

/** Capture an i18n key as a serializable `MessageRef` (`resolveLabel` resolves it). */
export function t(key: string): MessageRef {
    return { $t: key };
}

/**
 * Derive a machine-name slug from a `Label` (a literal string or a `{ $t }`
 * message reference). Falls back to `fallback` when the source slugifies to empty.
 */
export function labelToSlug(label: Label, fallback = 'section'): string {
    const source = typeof label === 'string' ? label : label.$t;
    return slugify(source) || fallback;
}

/**
 * Title-case a field name for display: `featured_image` → `Featured Image`,
 * `firstName` → `First Name`, `SEOTitle` → `SEO Title`.
 */
export function fieldNameToLabel(name: string): string {
    return startCase(name);
}

/** A field's display label — its own `label` if set, else its title-cased name. */
export function getFieldLabel(field: { name: string; label?: string }): string {
    return field.label || fieldNameToLabel(field.name);
}
