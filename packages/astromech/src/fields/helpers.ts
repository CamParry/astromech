/**
 * Field system helpers — merged from:
 *   - src/utilities/field-helpers.ts  (fieldNameToLabel, getFieldLabel)
 *   - src/utilities/entry-fields.ts   (flattenFieldNodes, flattenEntryFields)
 *   - src/utilities/field-count.ts    (CountRange, CountStatus, lengthStatus)
 */

import { startCase } from 'lodash-es';
import type { FieldDefinition, ResolvedEntryFields } from '@/types/fields.js';

// ============================================================================
// field-helpers
// ============================================================================

/**
 * Converts a field name to title case for display using lodash startCase
 * Examples:
 *   'featured_image' -> 'Featured Image'
 *   'firstName' -> 'First Name'
 *   'meta_title' -> 'Meta Title'
 *   'SEOTitle' -> 'SEO Title'
 */
export function fieldNameToLabel(name: string): string {
    return startCase(name);
}

/**
 * Gets a display label for a field, using the label if provided,
 * otherwise converting the field name to title case
 */
export function getFieldLabel(field: { name: string; label?: string }): string {
    return field.label || fieldNameToLabel(field.name);
}

// ============================================================================
// entry-fields
// ============================================================================

/**
 * Entry field-tree helpers.
 *
 * The resolved schema is a tree of `FieldDefinition` nodes split across two
 * columns (`main`/`sidebar`). Layout containers (`section`/`tabs`/`tab`/
 * `accordion`) hold no data — their children keep top-level data keys. Data
 * containers (`group`/`repeater`/`blocks`) own a single top-level key and nest
 * their children, so they are treated as opaque leaves here.
 */

const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

function collect(nodes: FieldDefinition[], out: FieldDefinition[]): void {
    for (const node of nodes) {
        if (LAYOUT_TYPES.has(node.type)) {
            collect(node.fields ?? [], out);
            continue;
        }
        out.push(node);
    }
}

/** Flatten a node list into its top-level data fields (layout containers unwrapped). */
export function flattenFieldNodes(nodes: FieldDefinition[]): FieldDefinition[] {
    const out: FieldDefinition[] = [];
    collect(nodes, out);
    return out;
}

/** Flatten a resolved two-column layout into its top-level data fields. */
export function flattenEntryFields(fields: ResolvedEntryFields): FieldDefinition[] {
    return [...flattenFieldNodes(fields.main), ...flattenFieldNodes(fields.sidebar)];
}

// ============================================================================
// field-count
// ============================================================================

/**
 * Character-count analysis for text inputs — pure and browser/server safe.
 *
 * Powers the advisory counter on `text`/`textarea` fields (`field.count`) and
 * is reused by plugins that audit content length (e.g. the SEO plugin's
 * title/description checks). An advisory range is soft: exceeding `max` is
 * allowed, it just reports `long`.
 */

/** Soft recommended length range. Either bound may be omitted. */
export type CountRange = { min?: number; max?: number };

export type CountStatus = 'empty' | 'short' | 'good' | 'long';

export function lengthStatus(length: number, range: CountRange): CountStatus {
    if (length === 0) return 'empty';
    if (range.min !== undefined && length < range.min) return 'short';
    if (range.max !== undefined && length > range.max) return 'long';
    return 'good';
}
