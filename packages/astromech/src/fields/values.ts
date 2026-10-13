/**
 * Root-level operations on a record of field values. Used by the update
 * paths, which patch a stored `fields` object rather than replacing it, parse
 * only the keys the schema declares, and carry the stored row's other keys
 * over into the row they write.
 */

import type { Field } from '@/types/fields';

/**
 * Merge `patch` onto `current` at the root level only. An absent or `undefined`
 * key keeps the current value; any other value — `null` included — overwrites.
 * The base is cloned because the pipeline mutates nested scopes in place, and
 * the caller still needs its untouched copy for change detection.
 */
export function mergePatch(
    current: Record<string, unknown> | null | undefined,
    patch: Record<string, unknown>
): Record<string, unknown> {
    const merged: Record<string, unknown> =
        current === null || current === undefined ? {} : structuredClone(current);
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        merged[key] = value;
    }
    return merged;
}

/**
 * Keep only the keys the schema declares, so data left behind by a removed
 * field does not survive every subsequent merge. Empty `definitions` means the
 * schema is unknown here, not that there are no fields, so nothing is dropped.
 */
export function projectToSchema(
    values: Record<string, unknown>,
    definitions: Field[]
): Record<string, unknown> {
    if (definitions.length === 0) return values;
    const names = new Set(definitions.map((field) => field.name));
    const projected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        if (names.has(key)) projected[key] = value;
    }
    return projected;
}

/**
 * `values` with the root keys of `stored` that the schema does not declare
 * carried over, so a value whose field was renamed or removed survives a save.
 * Only stored keys are carried: an undeclared key in `values` itself is the
 * caller's, and is dropped. Empty `definitions` means the schema is unknown
 * here, so `values` is returned as it is.
 */
export function keepUndeclaredKeys(
    values: Record<string, unknown>,
    stored: Record<string, unknown>,
    definitions: Field[]
): Record<string, unknown> {
    if (definitions.length === 0) return values;
    const kept = projectToSchema(values, definitions);
    const names = new Set(definitions.map((field) => field.name));
    for (const [key, value] of Object.entries(stored)) {
        if (!names.has(key)) kept[key] = value;
    }
    return kept;
}
