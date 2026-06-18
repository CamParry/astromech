/**
 * Label seam (spec §4) — resolve a config-time `Label` to a display string.
 *
 * Config never translates; it captures keys via `t(key)` → `{ $t }`. The admin
 * resolves them here against the one translation runtime (i18next):
 *   - descriptor `{ $t }` → `t(key, { ns })`
 *   - plain string        → the literal
 *   - omitted             → `Titlecase(name)`
 */

import type { TFunction } from 'i18next';
import type { Label } from '@/types/index.js';

function titleCase(name: string): string {
    return name
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

export function resolveLabel(
    value: Label | undefined,
    name: string,
    t: TFunction,
    ns: string
): string {
    if (value === undefined) return titleCase(name);
    if (typeof value === 'string') return value;
    return t(value.$t, { ns });
}
