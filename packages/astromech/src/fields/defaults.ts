/**
 * Build the value record a set of field definitions starts life with.
 *
 * The pipeline applies defaults on `create` only (`fields/parse-fields.ts`), so a
 * container item added while EDITING an existing resource would otherwise never
 * see them. The admin seeds an added item through here instead.
 *
 * Pure: no domain/DB imports.
 */

import type { Field } from '@/types/fields';
import { getFieldType } from './field-type-registry';
import { flattenFieldNodes } from './flatten';

/**
 * The declared defaults for `definitions`, keyed by field name — the field's own
 * `defaultValue`, else the field type's. A field with neither is absent.
 */
export function buildDefaultValues(definitions: Field[]): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    seedScope(values, definitions);
    return values;
}

/**
 * Seed one value scope: the record itself, or a nested object scope reported by
 * a container field. `values` is mutated in place, matching the pipeline, whose
 * `coerce → default` order this mirrors.
 */
function seedScope(values: Record<string, unknown>, definitions: Field[]): void {
    for (const field of flattenFieldNodes(definitions)) {
        const fieldType = getFieldType(field.type);

        // An existing value wins, so a group's own `defaultValue` is not
        // overwritten by its children's.
        let value = values[field.name];
        if (value === undefined || value === null) {
            const declared =
                field.defaultValue !== undefined
                    ? field.defaultValue
                    : fieldType?.defaultValue;
            // A default is shared by every item seeded from it, so it is cloned
            // rather than aliased into the value.
            value = declared === undefined ? undefined : structuredClone(declared);
        }

        // A container reports its nested scopes: `group` one object, the
        // array-shaped containers none until they hold items. Recursing here is
        // what carries a nested `defaultValue` into a fresh group.
        if (fieldType?.children !== undefined) {
            const { next, scopes } = fieldType.children(field, value);
            for (const scope of scopes) seedScope(scope.values, scope.definitions);
            value = next;
        }

        if (value !== undefined) {
            values[field.name] = value;
        }
    }
}
