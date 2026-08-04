/**
 * Content visibility — runtime filter and projection.
 *
 * Implements the two-axis model:
 *   - Shape axis (`public` / `full`): which fields you see.
 *   - Audience axis (row filter): which entries you may see at all.
 *
 * Applied at the end of `query()` and `get()`, just before return.
 */

import type {
    Entry,
    Field,
    JsonObject,
    JsonValue,
    RichTextAllow,
} from '@/types/index.js';
import type { JSONContent } from '@tiptap/core';
import { renderRichText } from '@/fields/rich-text/index.js';
import { PUBLIC_STRIPPED_KEYS, RESERVED_KEY } from '@/fields/reserved-keys.js';

// ============================================================================
// Public types
// ============================================================================

export type VisibilityShape = 'public' | 'full';

/**
 * Audience context for the visibility filter.
 * `roleSlug` is the current user's role slug, or null for anonymous.
 * `now` is the reference time for the publishedAt check.
 */
export type AudienceContext = {
    roleSlug: string | null;
    now: Date;
};

export type VisibilityOptions = {
    shape: VisibilityShape;
    /**
     * Flattened top-level field definitions for the entry's type.
     * Used to identify private fields and recurse into nested fields.
     */
    fields: Field[];
    audience: AudienceContext;
    /**
     * Preview mode (forward versioning): the caller has already authorized this
     * row via a preview token, so bypass the publish/schedule gate — but keep the
     * trashed check and apply the full public projection. Only meaningful with
     * `shape: 'public'`.
     */
    preview?: boolean;
};

// ============================================================================
// Write-back guard
// ============================================================================

export class PublicShapeWriteError extends Error {
    constructor() {
        super(
            "entry was read in 'public' shape; re-read with { full: true } before saving" +
                ' — saving it would drop private/internal fields'
        );
        this.name = 'PublicShapeWriteError';
    }
}

const PUBLIC_BRAND = Symbol('astromech.publicShape');

/** Stamp a non-enumerable Symbol brand on a value to mark it as public-shape. */
export function markPublic<T extends object>(value: T): T {
    Object.defineProperty(value, PUBLIC_BRAND, {
        value: true,
        enumerable: false,
        configurable: true,
        writable: false,
    });
    return value;
}

/** Returns true if the value carries the public-shape brand. */
export function isPublicBranded(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(value, PUBLIC_BRAND);
}

// ============================================================================
// Row filter (audience)
// ============================================================================

/**
 * Returns true if this entry row passes the public audience filter:
 * - status must be 'published' (or absent — entry types with statuses:false
 *   do not have publication workflows; their rows are always audience-visible)
 * - publishedAt must be null/absent (no scheduled gate) OR <= now
 * - deletedAt must be null/absent
 *
 * Note: tableStorage-backed entries omit status/publishedAt/deletedAt entirely;
 * treat absent values the same as null (no restriction).
 */
function passesPublicRowFilter(entry: Entry, now: Date): boolean {
    const e = entry as {
        status?: string | null;
        publishedAt?: Date | null;
        deletedAt?: Date | null;
    };
    // Entry types with `statuses: false` return undefined for status — always visible.
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
function passesPreviewRowFilter(entry: Entry): boolean {
    const e = entry as { deletedAt?: Date | null };
    return e.deletedAt == null;
}

// ============================================================================
// Structural strip (schema-free)
// ============================================================================

/**
 * Recursively strip `_disabled` items from arrays and delete `_disabled`/`_title`
 * from surviving objects. Preserves `_type`, `_id`, `_children`.
 *
 * This is schema-free and depth-agnostic — it walks any JSON value.
 */
function structuralStrip(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        const filtered = (value as JsonValue[]).filter(
            (item) =>
                !(
                    item !== null &&
                    typeof item === 'object' &&
                    !Array.isArray(item) &&
                    (item as JsonObject)[RESERVED_KEY.disabled] === true
                )
        );
        return filtered.map((item) => structuralStrip(item));
    }

    if (value !== null && typeof value === 'object') {
        const obj = value as JsonObject;
        const result: JsonObject = {};
        for (const [k, v] of Object.entries(obj)) {
            if (PUBLIC_STRIPPED_KEYS.has(k)) continue;
            result[k] = structuralStrip(v as JsonValue);
        }
        return result;
    }

    return value;
}

// ============================================================================
// Private-field projection strip
// ============================================================================

/**
 * Build a map from field name → Field for quick lookup.
 * Only includes data-bearing top-level fields (not layout fields).
 */
function fieldMap(fields: Field[]): Map<string, Field> {
    const map = new Map<string, Field>();
    for (const f of fields) {
        map.set(f.name, f);
    }
    return map;
}

/**
 * Strip private fields from a cloned `fields` object using the field definitions.
 * Recurses into group/repeater/blocks/tree child definitions.
 */
function stripPrivateFields(fields: JsonObject, fieldDefs: Field[]): JsonObject {
    const defs = fieldMap(fieldDefs);
    const result: JsonObject = {};

    for (const [key, rawValue] of Object.entries(fields)) {
        const def = defs.get(key);

        // No definition → keep as-is (e.g. system fields, unknown plugin fields)
        if (!def) {
            result[key] = rawValue;
            continue;
        }

        // Step 1: drop private fields
        if (def.private === true) continue;

        // Recurse into group children
        if (def.type === 'group' && def.fields && def.fields.length > 0) {
            if (
                rawValue !== null &&
                typeof rawValue === 'object' &&
                !Array.isArray(rawValue)
            ) {
                result[key] = stripPrivateFields(rawValue as JsonObject, def.fields);
            } else {
                result[key] = rawValue;
            }
            continue;
        }

        // Recurse into repeater items (each item is an object with child fields)
        if (def.type === 'repeater' && def.fields && def.fields.length > 0) {
            const repeaterFields = def.fields;
            if (Array.isArray(rawValue)) {
                result[key] = (rawValue as JsonValue[]).map((item) => {
                    if (
                        item !== null &&
                        typeof item === 'object' &&
                        !Array.isArray(item)
                    ) {
                        return stripPrivateFields(item as JsonObject, repeaterFields);
                    }
                    return item;
                });
            } else {
                result[key] = rawValue;
            }
            continue;
        }

        // Recurse into blocks items — each item has a `_type` key; match to block def
        if (def.type === 'blocks' && def.blocks && def.blocks.length > 0) {
            const blockDefsByType = new Map(def.blocks.map((b) => [b.type, b.fields]));
            if (Array.isArray(rawValue)) {
                result[key] = (rawValue as JsonValue[]).map((item) => {
                    if (
                        item !== null &&
                        typeof item === 'object' &&
                        !Array.isArray(item)
                    ) {
                        const obj = item as JsonObject;
                        const blockType = obj['_type'] as string | undefined;
                        const blockFields = blockType
                            ? blockDefsByType.get(blockType)
                            : undefined;
                        if (blockFields) {
                            return stripPrivateFields(obj, blockFields);
                        }
                    }
                    return item;
                });
            } else {
                result[key] = rawValue;
            }
            continue;
        }

        // Recurse into tree items (recursive structure with `_children`)
        if (def.type === 'tree' && def.fields && def.fields.length > 0) {
            result[key] = stripTreeItems(rawValue as JsonValue, def.fields);
            continue;
        }

        // Richtext: render JSON → HTML string for public shape
        if (def.type === 'richtext') {
            result[key] = renderRichText(
                rawValue as JSONContent | null | undefined,
                def.allow as RichTextAllow | undefined
            );
            continue;
        }

        // All other field types — pass value through
        result[key] = rawValue;
    }

    return result;
}

/**
 * Recursively strip private fields from tree items.
 * Tree items are objects with child field data + a `_children` array of more tree items.
 */
function stripTreeItems(value: JsonValue, childFields: Field[]): JsonValue {
    if (Array.isArray(value)) {
        return (value as JsonValue[]).map((item) => stripTreeItems(item, childFields));
    }
    if (value !== null && typeof value === 'object') {
        const obj = value as JsonObject;
        const { _children, ...rest } = obj;
        const stripped = stripPrivateFields(rest, childFields);
        if (_children !== undefined) {
            stripped['_children'] = stripTreeItems(_children as JsonValue, childFields);
        }
        return stripped;
    }
    return value;
}

// ============================================================================
// Main export: applyVisibility
// ============================================================================

/**
 * Apply the visibility filter to an entry.
 *
 * - `full` shape: returns the entry unchanged (trusted/admin path).
 * - `public` shape:
 *   1. Row filter: returns null if the entry is not published / is scheduled-future
 *      / is trashed (`preview` bypasses the publish gate, never the trashed check).
 *   2. Projection: strips private fields (using field definitions) and structural
 *      internals (`_disabled` items removed; `_disabled`/`_title` deleted from
 *      survivors; `_type`/`_id`/`_children` kept).
 *
 * A relation value is a raw id, so nothing here recurses into a related record.
 * The returned entry is a shallow clone — stored objects are not mutated.
 */
export function applyVisibility(entry: Entry, opts: VisibilityOptions): Entry | null {
    const { shape, fields, audience } = opts;

    if (shape === 'full') return entry;

    const rowOk = opts.preview
        ? passesPreviewRowFilter(entry)
        : passesPublicRowFilter(entry, audience.now);
    if (!rowOk) return null;

    // Clone fields first — never mutate the stored object.
    const projectedFields = stripPrivateFields({ ...entry.fields }, fields);
    const cleanFields = structuralStrip(projectedFields as JsonValue) as JsonObject;

    return { ...entry, fields: cleanFields };
}
