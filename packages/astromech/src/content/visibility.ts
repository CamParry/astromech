/**
 * Content visibility — applied at the end of a resource's `query()` and
 * `get()`. Two axes: the shape (`public` / `full`) decides which fields you
 * see, and the row filter decides which records you may see at all.
 *
 * Shared by every resource with per-locale authored values: a record is read
 * structurally, through `fields` plus whichever of the publish and trash
 * columns it carries, so an entry and a global go through the same filter.
 */

import type { EntryStatus, Field, JsonObject, JsonValue } from '@/types/index';
import { getFieldType } from '@/fields/field-type-registry';
import { flattenFieldNodes } from '@/fields/flatten';
import { PUBLIC_STRIPPED_KEYS, RESERVED_KEY } from '@/fields/reserved-keys';

/**
 * The record shape the filter reads. Every member but `fields` is optional: a
 * resource without statuses, scheduling or a trash carries none of them, and an
 * absent column counts as null.
 */
export type VisibleRecord = {
    fields: JsonObject;
    status?: EntryStatus | undefined;
    publishedAt?: Date | null | undefined;
    deletedAt?: Date | null | undefined;
};

/** Which fields a read returns: `public` strips private ones, `full` keeps them. */
export type VisibilityShape = 'public' | 'full';

/**
 * Audience context for the visibility filter.
 * `now` is the reference time for the publishedAt check.
 */
export type AudienceContext = {
    now: Date;
};

export type VisibilityOptions = {
    shape: VisibilityShape;
    /**
     * Flattened top-level field definitions for the record's type.
     * Used to identify private fields and recurse into nested fields.
     */
    fields: Field[];
    audience: AudienceContext;
    /**
     * Preview mode (forward versioning): the caller has already authorized this
     * row via a preview token, so bypass the publish/schedule gate — the trashed
     * check still applies. Only meaningful with `shape: 'public'`.
     */
    preview?: boolean;
};

/**
 * True when the row passes the public audience filter: status is 'published' or
 * absent, publishedAt is null/absent or past, and deletedAt is null/absent. An
 * absent column counts as null — tableRepository-backed entries omit all three.
 */
function passesPublicRowFilter(e: VisibleRecord, now: Date): boolean {
    // A resource with `statuses: false` reports no status — always visible.
    if (e.status !== undefined && e.status !== null && e.status !== 'published')
        return false;
    if (e.publishedAt != null && e.publishedAt > now) return false;
    if (e.deletedAt != null) return false;
    return true;
}

/**
 * Preview row filter: the publish/schedule gate is bypassed (the caller verified
 * a preview token), but a trashed row never previews.
 */
function passesPreviewRowFilter(record: VisibleRecord): boolean {
    return record.deletedAt == null;
}

/**
 * Recursively strip `_disabled` items from arrays and delete `_disabled`/`_title`
 * from surviving objects. Preserves `_type`, `_id`, `_children`.
 *
 * This is schema-free and depth-agnostic — it walks any JSON value.
 */
function structuralStrip(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        const filtered = value.filter(
            (item) =>
                !(
                    item !== null &&
                    typeof item === 'object' &&
                    !Array.isArray(item) &&
                    item[RESERVED_KEY.disabled] === true
                )
        );
        return filtered.map((item) => structuralStrip(item));
    }

    if (value !== null && typeof value === 'object') {
        const obj = value;
        const result: JsonObject = {};
        for (const [k, v] of Object.entries(obj)) {
            if (PUBLIC_STRIPPED_KEYS.has(k)) continue;
            result[k] = structuralStrip(v);
        }
        return result;
    }

    return value;
}

/**
 * Strip private fields from one value scope, in place, and give each kept value
 * its public form. Nested scopes come from the field type's `children`, so a
 * container of any type, core or plugin, is stripped the same way. A key with
 * no definition (a system or unknown plugin field) is kept as it is.
 */
function stripPrivateFields(values: Record<string, unknown>, definitions: Field[]): void {
    for (const field of flattenFieldNodes(definitions)) {
        if (!(field.name in values)) continue;
        if (field.private === true) {
            Reflect.deleteProperty(values, field.name);
            continue;
        }
        const fieldType = getFieldType(field.type);
        let value = values[field.name];
        if (fieldType?.children !== undefined && value !== null && value !== undefined) {
            const { next, scopes } = fieldType.children(field, value);
            for (const scope of scopes)
                stripPrivateFields(scope.values, scope.definitions);
            value = next;
        }
        if (fieldType?.toPublic !== undefined) value = fieldType.toPublic(field, value);
        values[field.name] = value;
    }
}

/**
 * Apply the visibility filter to one record. `full` returns it unchanged;
 * `public` returns null for an unpublished, scheduled-future or trashed row
 * (`preview` bypasses the publish gate only), else a clone stripped of private
 * fields. The record's own type is preserved, so a caller keeps whatever
 * columns it passed in.
 */
export function applyVisibility<T extends VisibleRecord>(
    record: T,
    opts: VisibilityOptions
): T | null {
    const { shape, fields, audience } = opts;

    if (shape === 'full') return record;

    const rowOk = opts.preview
        ? passesPreviewRowFilter(record)
        : passesPublicRowFilter(record, audience.now);
    if (!rowOk) return null;

    // Clone the root first — `children` clones every nested scope it reports,
    // so the stored object is never mutated.
    const projectedFields: Record<string, unknown> = { ...record.fields };
    stripPrivateFields(projectedFields, fields);
    const cleanFields = structuralStrip(projectedFields as JsonValue) as JsonObject;

    return { ...record, fields: cleanFields };
}
