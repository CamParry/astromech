/**
 * Label seam: resolves a config-time `Label` to a display string against
 * i18next. A `{ $t }` descriptor calls `t(key, { ns })`, a plain string is
 * the literal, and an omitted value falls back to `Titlecase(name)`.
 */

import type { Label } from '@/types/index';
import type { TFunction } from 'i18next';

/**
 * The fallback an omitted `Label` resolves to. Exported so anything building a
 * label without a `t` in hand (the validation summary) produces the same string
 * the field's own label does.
 */
export function titleCase(name: string): string {
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
