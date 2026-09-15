/**
 * Config-time `Label` helpers — runtime-agnostic, no i18next dependency.
 * Config never translates; it captures keys via `t(key)` → `{ $t }`, and the
 * admin resolves them with its own resolver.
 */

import type { MessageRef } from '@/types/fields';
import { startCase } from 'lodash-es';

/** Capture an i18n key as a serializable `MessageRef` (`resolveLabel` resolves it). */
export function t(key: string): MessageRef {
    return { $t: key };
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
