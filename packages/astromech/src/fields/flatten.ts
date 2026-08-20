/**
 * Flatten an entry's field tree to its top-level data fields. Layout fields
 * are transparent (unwrapped); nested fields own one top-level key and are
 * treated as opaque leaves.
 */

import type { Field, ResolvedEntryFields } from '@/types/fields';

/** Flatten a node list into its top-level data fields (layout fields unwrapped). */
export function flattenFieldNodes(nodes: Field[]): Field[] {
    const out: Field[] = [];
    collect(nodes, out);
    return out;
}

/** Flatten a resolved two-column layout into its top-level data fields. */
export function flattenEntryFields(fields: ResolvedEntryFields): Field[] {
    return [...flattenFieldNodes(fields.main), ...flattenFieldNodes(fields.sidebar)];
}

const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

function collect(nodes: Field[], out: Field[]): void {
    for (const node of nodes) {
        if (LAYOUT_TYPES.has(node.type)) {
            collect(node.fields ?? [], out);
            continue;
        }
        out.push(node);
    }
}
