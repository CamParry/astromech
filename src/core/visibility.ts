/**
 * Content visibility — runtime filter and projection.
 *
 * Implements the two-axis model from specs/content-visibility.md §6:
 *   - Shape axis (`public` / `full`): which fields you see.
 *   - Audience axis (row filter): which entries you may see at all.
 *
 * Applied at the end of `query()` and `get()`, after populate, before return.
 */

import type { Entry, FieldDefinition, JsonObject, JsonValue } from '@/types/index.js';

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
     * Used to identify private fields and recurse into data containers.
     */
    fields: FieldDefinition[];
    audience: AudienceContext;
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
    const e = entry as { status?: string | null; publishedAt?: Date | null; deletedAt?: Date | null };
    // Entry types with `statuses: false` return undefined for status — always visible.
    if (e.status !== undefined && e.status !== null && e.status !== 'published') return false;
    if (e.publishedAt != null && e.publishedAt > now) return false;
    if (e.deletedAt != null) return false;
    return true;
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
                    (item as JsonObject)['_disabled'] === true
                )
        );
        return filtered.map((item) => structuralStrip(item));
    }

    if (value !== null && typeof value === 'object') {
        const obj = value as JsonObject;
        const result: JsonObject = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k === '_disabled' || k === '_title') continue;
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
 * Build a map from field name → FieldDefinition for quick lookup.
 * Only includes data-bearing top-level fields (not layout containers).
 */
function fieldMap(fields: FieldDefinition[]): Map<string, FieldDefinition> {
    const map = new Map<string, FieldDefinition>();
    for (const f of fields) {
        map.set(f.name, f);
    }
    return map;
}

/**
 * Strip private fields from a cloned `fields` object using the field definitions.
 * Recurses into group/repeater/blocks/tree child definitions.
 *
 * `resolveRelatedFields` is called for populated relation objects — it should
 * return the FieldDefinition[] for the related entry type (or [] if unknown).
 */
function stripPrivateFields(
    fields: JsonObject,
    fieldDefs: FieldDefinition[],
    resolveRelatedFields: (entry: Entry) => FieldDefinition[]
): JsonObject {
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

        // Step 3: recurse into populated relation values (plain entry objects)
        if (def.type === 'relationship') {
            const value = rawValue;
            if (value === null || typeof value === 'string') {
                // Un-populated (raw id string) or null — pass through
                result[key] = value;
            } else if (Array.isArray(value)) {
                // Multiple relation — may be ids (strings) or populated entry objects
                const filtered: JsonValue[] = [];
                for (const item of value as JsonValue[]) {
                    if (item === null || typeof item === 'string') {
                        filtered.push(item);
                    } else if (typeof item === 'object' && !Array.isArray(item)) {
                        const related = item as unknown as Entry;
                        const stripped = applyPublicProjectionToRelated(
                            related,
                            resolveRelatedFields(related)
                        );
                        if (stripped !== null) filtered.push(stripped as unknown as JsonValue);
                    } else {
                        filtered.push(item);
                    }
                }
                result[key] = filtered;
            } else if (typeof value === 'object') {
                // Single populated entry object
                const related = value as unknown as Entry;
                const stripped = applyPublicProjectionToRelated(
                    related,
                    resolveRelatedFields(related)
                );
                result[key] = stripped !== null ? (stripped as unknown as JsonValue) : null;
            } else {
                result[key] = value;
            }
            continue;
        }

        // Recurse into group children
        if (def.type === 'group' && def.fields && def.fields.length > 0) {
            if (rawValue !== null && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
                result[key] = stripPrivateFields(
                    rawValue as JsonObject,
                    def.fields,
                    resolveRelatedFields
                );
            } else {
                result[key] = rawValue;
            }
            continue;
        }

        // Recurse into repeater items (each item is an object with child fields)
        if (def.type === 'repeater' && def.fields && def.fields.length > 0) {
            if (Array.isArray(rawValue)) {
                result[key] = (rawValue as JsonValue[]).map((item) => {
                    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                        return stripPrivateFields(
                            item as JsonObject,
                            def.fields!,
                            resolveRelatedFields
                        );
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
                    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                        const obj = item as JsonObject;
                        const blockType = obj['_type'] as string | undefined;
                        const blockFields = blockType ? blockDefsByType.get(blockType) : undefined;
                        if (blockFields) {
                            return stripPrivateFields(obj, blockFields, resolveRelatedFields);
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
            result[key] = stripTreeItems(rawValue as JsonValue, def.fields, resolveRelatedFields);
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
function stripTreeItems(
    value: JsonValue,
    childFields: FieldDefinition[],
    resolveRelatedFields: (entry: Entry) => FieldDefinition[]
): JsonValue {
    if (Array.isArray(value)) {
        return (value as JsonValue[]).map((item) =>
            stripTreeItems(item, childFields, resolveRelatedFields)
        );
    }
    if (value !== null && typeof value === 'object') {
        const obj = value as JsonObject;
        const { _children, ...rest } = obj;
        const stripped = stripPrivateFields(rest, childFields, resolveRelatedFields);
        if (_children !== undefined) {
            stripped['_children'] = stripTreeItems(
                _children as JsonValue,
                childFields,
                resolveRelatedFields
            );
        }
        return stripped;
    }
    return value;
}

// ============================================================================
// Related entry projection
// ============================================================================

/**
 * Apply public projection to a populated related entry object.
 * Returns null if the related entry is not published (audience filter).
 * Otherwise strips private fields and structural internals.
 */
function applyPublicProjectionToRelated(
    related: Entry,
    relatedFields: FieldDefinition[]
): Entry | null {
    // Audience filter: related entry must itself be published
    const now = new Date();
    if (!passesPublicRowFilter(related, now)) return null;

    // Strip private fields (no further relation recursion to prevent deep nesting issues)
    const strippedFields = stripPrivateFields(
        { ...(related.fields ?? {}) },
        relatedFields,
        () => [] // no deeper relation recursion
    );

    // Structural strip
    const cleanFields = structuralStrip(strippedFields as JsonValue) as JsonObject;

    return { ...related, fields: cleanFields };
}

// ============================================================================
// Main export: applyVisibility
// ============================================================================

/**
 * Apply the visibility filter to an entry.
 *
 * - `full` shape: returns the entry unchanged (trusted/admin path).
 * - `public` shape:
 *   1. Row filter: returns null if the entry is not published / is scheduled-future / is trashed.
 *   2. Projection: strips private fields (using field definitions) and structural
 *      internals (`_disabled` items removed; `_disabled`/`_title` deleted from survivors;
 *      `_type`/`_id`/`_children` kept).
 *   3. Populated relation objects are filtered by audience and projected recursively.
 *
 * The returned entry is a shallow clone — stored objects are not mutated.
 */
export function applyVisibility(entry: Entry, opts: VisibilityOptions): Entry | null {
    const { shape, fields, audience } = opts;

    // full shape: no-op
    if (shape === 'full') return entry;

    // Row filter
    if (!passesPublicRowFilter(entry, audience.now)) return null;

    // Build a resolver for related entry type fields.
    // At this point we don't have config access — callers pass fields for the
    // primary type. For populated relations within those fields, we rely on the
    // caller to have resolved the correct fields (or pass [] for unknown types).
    // Step 3 wires this in entries.ts via resolveEntryType per relation target.
    const resolveRelatedFields = (_related: Entry): FieldDefinition[] => {
        // Populated relations carry their type — the caller-provided `resolveRelated`
        // closure (set per call site in entries.ts) handles this. Default: no fields.
        return [];
    };

    // Strip private fields (step 1) — clone fields first, never mutate stored object
    const clonedFields = { ...entry.fields };
    const projectedFields = stripPrivateFields(clonedFields, fields, resolveRelatedFields);

    // Structural strip (step 2) — removes _disabled items and _disabled/_title keys
    const cleanFields = structuralStrip(projectedFields as JsonValue) as JsonObject;

    return { ...entry, fields: cleanFields };
}

/**
 * Variant of applyVisibility that accepts a resolver for related entry field definitions.
 * Used by the entries orchestrator to thread config knowledge into relation projection.
 */
export function applyVisibilityWithRelations(
    entry: Entry,
    opts: VisibilityOptions,
    resolveRelatedFields: (related: Entry) => FieldDefinition[]
): Entry | null {
    const { shape, fields, audience } = opts;

    if (shape === 'full') return entry;
    if (!passesPublicRowFilter(entry, audience.now)) return null;

    const clonedFields = { ...entry.fields };
    const projectedFields = stripPrivateFields(clonedFields, fields, resolveRelatedFields);
    const cleanFields = structuralStrip(projectedFields as JsonValue) as JsonObject;

    return { ...entry, fields: cleanFields };
}
