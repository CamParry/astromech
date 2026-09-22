/**
 * Flatten an entry's field tree to its top-level data fields. Layout fields
 * are transparent (unwrapped); nested fields own one top-level key and are
 * treated as opaque leaves.
 */

import type { DataField, Field, LayoutField, ResolvedEntryFields } from '@/types/fields';

const LAYOUT_TYPES: ReadonlySet<string> = new Set(['group', 'accordion', 'tabs', 'tab']);

/** Whether a node is a layout field: a structural field with no name, storing nothing. */
export function isLayoutField(node: Field): node is LayoutField {
    return node.name === undefined && LAYOUT_TYPES.has(node.type);
}

/**
 * Flatten a node list into its top-level data fields (layout fields unwrapped).
 * A `private` layout field makes every field below it private.
 */
export function flattenFieldNodes(nodes: Field[]): DataField[] {
    const out: DataField[] = [];
    collect(nodes, false, out);
    return out;
}

/** Flatten a resolved two-column layout into its top-level data fields. */
export function flattenEntryFields(fields: ResolvedEntryFields): DataField[] {
    return [...flattenFieldNodes(fields.main), ...flattenFieldNodes(fields.sidebar)];
}

function collect(nodes: Field[], inPrivate: boolean, out: DataField[]): void {
    for (const node of nodes) {
        if (isLayoutField(node)) {
            collect(node.fields, inPrivate || node.private === true, out);
            continue;
        }
        out.push(inPrivate && node.private !== true ? { ...node, private: true } : node);
    }
}
