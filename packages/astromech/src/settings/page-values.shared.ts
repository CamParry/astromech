/**
 * Pure partition + merge helpers for settings-page per-locale keys. No
 * DB, no virtual modules — safe to import in tests. `<path>` holds shared
 * fields, `<path>:<locale>` holds per-locale (translatable) fields.
 */

import type { ResolvedEntryFields } from '@/types/fields';
import type { JsonObject, JsonValue } from '@/types/index';
import { flattenEntryFields } from '@/fields/flatten';

export type PartitionedGlobalValues = {
    shared: JsonObject;
    perLocale: JsonObject;
};

/**
 * Split a values object by each top-level field's `translatable` flag.
 * `translatable === false` goes to `shared`; everything else, including
 * unknown keys, goes to `perLocale`.
 */
export function partitionGlobalValues(
    fields: ResolvedEntryFields,
    values: Record<string, unknown>
): PartitionedGlobalValues {
    const topLevel = flattenEntryFields(fields);
    const shared: JsonObject = {};
    const perLocale: JsonObject = {};

    for (const [k, v] of Object.entries(values)) {
        const field = topLevel.find((f) => f.name === k);
        if (field?.translatable === false) {
            shared[k] = v as JsonObject[string];
        } else {
            perLocale[k] = v as JsonObject[string];
        }
    }

    return { shared, perLocale };
}

/**
 * Merge shared and per-locale blobs, per-locale winning on key conflicts.
 */
export function mergeGlobalValues(
    shared: JsonObject | null,
    perLocale: JsonObject | null
): Record<string, unknown> {
    return { ...(shared ?? {}), ...(perLocale ?? {}) };
}

/**
 * Locale-aware merge for `settings.get`: `{ ...base, ...localeValue }` when
 * both are plain objects, else `base` unchanged (scalar, null, or an array
 * on either side). Pure — no DB, no virtual-module imports.
 */
export function mergeLocaleSetting(
    base: JsonValue | null,
    localeValue: JsonValue | null | undefined
): JsonValue | null {
    if (
        base !== null &&
        typeof base === 'object' &&
        !Array.isArray(base) &&
        localeValue !== null &&
        localeValue !== undefined &&
        typeof localeValue === 'object' &&
        !Array.isArray(localeValue)
    ) {
        return {
            ...(base as Record<string, JsonValue>),
            ...(localeValue as Record<string, JsonValue>),
        };
    }
    return base;
}
