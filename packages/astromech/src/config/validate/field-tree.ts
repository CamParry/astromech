/**
 * Structural validation of an authored field tree, and the duplicate-name guard
 * that keeps one value namespace from writing the same key twice.
 */

import type { Field, ResolvedEntryFields } from '@/types/fields';

/** Layout fields — presentational, flat data. Their children stay top-level. */
export const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

export type DataFieldPath = { field: Field; path: string };

/**
 * Structural-rule validation (spec §3.3), crash-loud naming the entry type:
 * `tab` is only valid as a direct child of `tabs`, and `tabs` may only contain
 * `tab` children.
 */
export function validateFieldTree(
    typeKey: string,
    nodes: Field[],
    insideTabs: boolean
): void {
    for (const node of nodes) {
        if (node.type === 'tab' && !insideTabs) {
            throw new Error(
                `Astromech entry type "${typeKey}": \`tab\` ("${node.name}") must be a ` +
                    `direct child of \`tabs\`.`
            );
        }
        if (node.type === 'tabs') {
            const children = node.fields ?? [];
            for (const child of children) {
                if (child.type !== 'tab') {
                    throw new Error(
                        `Astromech entry type "${typeKey}": \`tabs\` may only contain ` +
                            `\`tab\` children (got "${child.type}").`
                    );
                }
            }
            validateFieldTree(typeKey, children, true);
            continue;
        }
        if (node.fields) validateFieldTree(typeKey, node.fields, false);
    }
}

/**
 * Reject two data fields that write the same key. The value namespace is
 * flat — layout fields are unwrapped and `main`/`sidebar` share one value
 * object, so a name repeated at any depth would overwrite silently.
 */
export function assertUniqueDataNames(
    typeKey: string,
    fields: ResolvedEntryFields
): void {
    assertUniqueInNamespace(typeKey, [
        ...dataFieldsWithPath(fields.main, 'main'),
        ...dataFieldsWithPath(fields.sidebar, 'sidebar'),
    ]);
}

/** The data fields one value namespace holds, each with where it was authored. */
export function dataFieldsWithPath(nodes: Field[], path: string): DataFieldPath[] {
    const out: DataFieldPath[] = [];
    for (const node of nodes) {
        const nodePath = `${path}.${node.name}`;
        if (LAYOUT_TYPES.has(node.type)) {
            out.push(...dataFieldsWithPath(node.fields ?? [], nodePath));
            continue;
        }
        out.push({ field: node, path: nodePath });
    }
    return out;
}

/** Throw on a repeated name, naming both paths, then check each nested namespace. */
export function assertUniqueInNamespace(typeKey: string, fields: DataFieldPath[]): void {
    const seen = new Map<string, string>();
    for (const { field, path } of fields) {
        const first = seen.get(field.name);
        if (first !== undefined) {
            throw new Error(
                `Astromech entry type "${typeKey}": duplicate field name ` +
                    `"${field.name}" — \`${first}\` and \`${path}\` write the same key.`
            );
        }
        seen.set(field.name, path);
        // A nested field (group/repeater/blocks) owns one key and nests its
        // children, so its subtree is a namespace of its own.
        if (field.fields) {
            assertUniqueInNamespace(typeKey, dataFieldsWithPath(field.fields, path));
        }
    }
}
