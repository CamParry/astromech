/**
 * Entry field-tree helpers.
 *
 * The resolved schema is a tree of `FieldDefinition` nodes split across two
 * columns (`main`/`sidebar`). Layout containers (`section`/`tabs`/`tab`/
 * `accordion`) hold no data — their children keep top-level data keys. Data
 * containers (`group`/`repeater`/`blocks`) own a single top-level key and nest
 * their children, so they are treated as opaque leaves here.
 */

import type { FieldDefinition, ResolvedEntryFields } from '@/types/fields.js';

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
