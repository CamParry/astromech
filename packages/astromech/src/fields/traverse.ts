/**
 * The one walk over a field schema, after Payload's `traverseFields`: every
 * node in declaration order, descending through layout fields in place and
 * into a data field through its type's `subFields`.
 */

import type { Field } from '@/types/fields';
import { getFieldType } from './field-type-registry';
import { fieldAffectsData, isLayoutField } from './flatten';

/** What the visitor is told about one node. */
export type FieldVisit = {
    field: Field;
    /**
     * A data field's schema path (`sections[].title`). A layout field has no
     * path of its own, so it gets the path of the scope it sits in, `''` at the root.
     */
    schemaPath: string;
    /** The enclosing nodes, outermost first: layout fields and nested data fields. */
    ancestors: readonly Field[];
    /** Whether this node or an enclosing one is `private`. */
    private: boolean;
};

/** Called for each node; returning `false` skips the node's children. */
export type FieldVisitor = (visit: FieldVisit) => unknown;

/** Visit every node of `fields`, depth first. */
export function traverseFields(fields: Field[], visitor: FieldVisitor): void {
    walk(fields, '', [], false, visitor);
}

function walk(
    fields: Field[],
    scopePath: string,
    ancestors: readonly Field[],
    inPrivate: boolean,
    visitor: FieldVisitor
): void {
    for (const field of fields) {
        const isPrivate = inPrivate || field.private === true;
        const layout = isLayoutField(field);
        const schemaPath =
            layout || field.name === undefined
                ? scopePath
                : scopePath === ''
                  ? field.name
                  : `${scopePath}.${field.name}`;
        if (visitor({ field, schemaPath, ancestors, private: isPrivate }) === false) {
            continue;
        }

        const inner = [...ancestors, field];
        if (layout) {
            walk(field.fields, scopePath, inner, isPrivate, visitor);
            continue;
        }
        if (!fieldAffectsData(field)) continue;
        for (const scope of getFieldType(field.type)?.subFields?.(field) ?? []) {
            const path = scope.repeats ? `${schemaPath}[]` : schemaPath;
            walk(scope.fields, path, inner, isPrivate, visitor);
        }
    }
}
