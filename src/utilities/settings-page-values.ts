/**
 * Pure partition + merge helpers for settings-page per-locale storage.
 *
 * No DB, no virtual modules, no side-effects — safe to import in tests.
 *
 * Storage model:
 *   `<path>`           → shared (non-translatable top-level) fields
 *   `<path>:<locale>`  → per-locale (translatable) fields
 *
 * "Top-level data field" = walk the tree; layout containers are transparent;
 * data containers (group/repeater/blocks) and leaves are a single key whose
 * own `translatable` flag governs.
 */

import { flattenEntryFields } from '@/utilities/entry-fields.js';
import type { ResolvedEntryFields } from '@/types/fields.js';
import type { JsonObject, JsonValue } from '@/types/index.js';

export type PartitionedGlobalValues = {
    shared: JsonObject;
    perLocale: JsonObject;
};

/**
 * Split a values object by each top-level field's `translatable` flag.
 * Fields with `translatable === false` go to `shared`; all others go to
 * `perLocale`. Unknown keys (not found in the field tree) default to
 * `perLocale` (safe).
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
 * Locale-aware merge for `settings.get`.
 *
 * Given a `base` value stored at `<key>` and an optional `localeValue` stored
 * at `<key>:<locale>`, returns:
 * - `{ ...base, ...localeValue }` when BOTH are plain (non-array) objects.
 * - `base` in every other case (scalar base, null base, null/absent locale
 *   value, or array on either side).
 *
 * Pure — no DB, no virtual-module imports.
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
