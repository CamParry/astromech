/**
 * Structural validation of an authored field tree, and the duplicate-name guard
 * that keeps one value namespace from writing the same key twice.
 */

import type { DataField, Field, ResolvedEntryFields } from '@/types/fields';
import { isLayoutField } from '@/fields/flatten';

type DataFieldPath = { field: DataField; path: string };

/** Where a node sits: under `tabs`, inside an item container, below a nested field. */
type TreePosition = {
    insideTabs: boolean;
    /** The nearest enclosing `repeater`, `blocks` or `tree`, if any. */
    itemContainer: string | undefined;
    /** Whether any enclosing field stores its children under its own key. */
    nested: boolean;
};

const ITEM_CONTAINERS = new Set(['repeater', 'blocks', 'tree']);

/** Structural types a raw object may not name: only the builder nests them. */
const UNNAMED_TYPES = new Set(['tabs', 'tab', 'accordion']);

/**
 * Structural-rule validation, crash-loud naming the entry type: `tab` sits only
 * directly inside `tabs`, which holds nothing else and never sits in an item
 * container; names and flags that would silently do nothing are rejected.
 */
export function validateFieldTree(typeKey: string, nodes: Field[]): void {
    walkTree(typeKey, nodes, {
        insideTabs: false,
        itemContainer: undefined,
        nested: false,
    });
}

function walkTree(typeKey: string, nodes: Field[], position: TreePosition): void {
    for (const node of nodes) {
        assertNodeValid(typeKey, node, position);
        if (isLayoutField(node)) {
            walkTree(typeKey, node.fields, {
                ...position,
                insideTabs: node.type === 'tabs',
            });
            continue;
        }
        const childPosition: TreePosition = {
            insideTabs: false,
            itemContainer: ITEM_CONTAINERS.has(node.type)
                ? node.type
                : position.itemContainer,
            nested: true,
        };
        if (node.fields !== undefined) walkTree(typeKey, node.fields, childPosition);
        for (const block of node.blocks ?? []) {
            walkTree(typeKey, block.fields, childPosition);
        }
    }
}

function assertNodeValid(typeKey: string, node: Field, position: TreePosition): void {
    const prefix = `Astromech entry type "${typeKey}":`;
    if (node.name !== undefined && UNNAMED_TYPES.has(node.type)) {
        throw new Error(
            `${prefix} a \`${node.type}\` object cannot carry a name ("${node.name}"). ` +
                (node.type === 'tabs'
                    ? '`tabs` is never named; name a `tab` inside it instead.'
                    : `Build it with \`fields.${node.type}('${node.name}', …)\` to store ` +
                      'its fields under that key, or drop the name.')
        );
    }
    if (node.type === 'group' && node.name === undefined && node.boxed === false) {
        throw new Error(
            `${prefix} an unnamed \`group\` with \`boxed: false\` does nothing. Give it a ` +
                'name to store its fields under that key, or drop `boxed: false`.'
        );
    }
    if (node.type === 'tab' && !position.insideTabs) {
        throw new Error(`${prefix} \`tab\` must be a direct child of \`tabs\`.`);
    }
    if (position.insideTabs && node.type !== 'tab') {
        throw new Error(
            `${prefix} \`tabs\` may only contain \`tab\` children (got "${node.type}").`
        );
    }
    if (node.type === 'tabs' && position.itemContainer !== undefined) {
        throw new Error(
            `${prefix} \`tabs\` cannot sit inside a \`${position.itemContainer}\`.`
        );
    }
    if (isLayoutField(node) || !position.nested) return;
    for (const flag of ['translatable', 'searchable'] as const) {
        if (node[flag] !== undefined) {
            throw new Error(
                `${prefix} field "${node.name}" sets \`${flag}\`, which is only ` +
                    'supported on a top-level field, not one inside a group, ' +
                    'repeater, blocks or tree.'
            );
        }
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

/**
 * The data fields one value namespace holds, each with where it was authored.
 * A layout field has no name, so its step in the path is its index.
 */
function dataFieldsWithPath(nodes: Field[], path: string): DataFieldPath[] {
    const out: DataFieldPath[] = [];
    for (const [index, node] of nodes.entries()) {
        if (isLayoutField(node)) {
            out.push(...dataFieldsWithPath(node.fields, `${path}[${index}]`));
            continue;
        }
        out.push({ field: node, path: `${path}.${node.name}` });
    }
    return out;
}

/** Throw on a repeated name, naming both paths, then check each nested namespace. */
function assertUniqueInNamespace(typeKey: string, fields: DataFieldPath[]): void {
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
