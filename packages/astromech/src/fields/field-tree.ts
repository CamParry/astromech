/**
 * Structural validation of an authored field tree, and the duplicate-name guard
 * that keeps one value namespace from writing the same key twice. Both run on
 * `traverseFields` and ask each field's type what it is.
 */

import type { DataField, Field, ResolvedEntryFields } from '@/types/fields';
import { getFieldType } from './field-type-registry';
import { fieldAffectsData, isLayoutField } from './flatten';
import { traverseFields } from './traverse';

type DataFieldPath = { field: DataField; path: string };

/**
 * Structural-rule validation, crash-loud naming the owner (`entry type "post"`,
 * `global "footer"`, `media`, `users`): `tab` sits only directly inside `tabs`,
 * which holds nothing else and never sits in an item container; an unnamed tab
 * or accordion has a label; names and flags that would do nothing are rejected.
 */
export function validateFieldTree(owner: string, nodes: Field[]): void {
    traverseFields(nodes, ({ field, ancestors }) => {
        assertNodeValid(`Astromech ${owner}:`, field, ancestors);
    });
}

function assertNodeValid(prefix: string, node: Field, ancestors: readonly Field[]): void {
    const fieldType = getFieldType(node.type);
    const parent = ancestors.at(-1);
    if (
        node.name !== undefined &&
        fieldType?.layout === true &&
        fieldType.affectsData === false
    ) {
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
    if (
        isLayoutField(node) &&
        (node.type === 'tab' || node.type === 'accordion') &&
        node.label === undefined
    ) {
        throw new Error(
            `${prefix} an unnamed \`${node.type}\` needs a \`label\` to show its editors.`
        );
    }
    if (node.type === 'tab' && parent?.type !== 'tabs') {
        throw new Error(`${prefix} \`tab\` must be a direct child of \`tabs\`.`);
    }
    if (parent?.type === 'tabs' && node.type !== 'tab') {
        throw new Error(
            `${prefix} \`tabs\` may only contain \`tab\` children (got "${node.type}").`
        );
    }
    const itemContainer = [...ancestors].reverse().find(isItemContainer);
    if (node.type === 'tabs' && itemContainer !== undefined) {
        throw new Error(
            `${prefix} \`tabs\` cannot sit inside a \`${itemContainer.type}\`.`
        );
    }
    if (!fieldAffectsData(node) || !ancestors.some(fieldAffectsData)) return;
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

/** A data field whose nested scopes repeat once per item. */
function isItemContainer(node: Field): boolean {
    if (!fieldAffectsData(node)) return false;
    const scopes = getFieldType(node.type)?.subFields?.(node) ?? [];
    return scopes.some((scope) => scope.repeats);
}

/**
 * Reject two data fields that write the same key. Layout fields are unwrapped
 * and `main`/`sidebar` share one value object, so each value namespace (the
 * root, and every scope a nested field declares, block by block) is checked.
 */
export function assertUniqueDataNames(owner: string, fields: ResolvedEntryFields): void {
    const prefix = `Astromech ${owner}:`;
    assertUniqueInNamespace(prefix, [
        ...dataFieldsWithPath(fields.main, 'main'),
        ...dataFieldsWithPath(fields.sidebar, 'sidebar'),
    ]);
    traverseFields([...fields.main, ...fields.sidebar], ({ field, schemaPath }) => {
        if (!fieldAffectsData(field)) return;
        for (const scope of getFieldType(field.type)?.subFields?.(field) ?? []) {
            const path = scope.repeats ? `${schemaPath}[]` : schemaPath;
            assertUniqueInNamespace(prefix, dataFieldsWithPath(scope.fields, path));
        }
    });
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
        if (fieldAffectsData(node))
            out.push({ field: node, path: `${path}.${node.name}` });
    }
    return out;
}

/** Throw on a repeated name, naming both paths. */
function assertUniqueInNamespace(prefix: string, fields: DataFieldPath[]): void {
    const seen = new Map<string, string>();
    for (const { field, path } of fields) {
        const first = seen.get(field.name);
        if (first !== undefined) {
            throw new Error(
                `${prefix} duplicate field name "${field.name}" — \`${first}\` and ` +
                    `\`${path}\` write the same key.`
            );
        }
        seen.set(field.name, path);
    }
}
