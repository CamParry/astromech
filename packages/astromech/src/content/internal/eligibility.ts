/**
 * Which fields a content operation may send to a model.
 *
 * An allow-list by field type, so an unrecognised or plugin-registered type is
 * never sent. Pure: it walks definitions + stored values and reports targets.
 */

import { getFieldTypeDescriptor } from '@/fields/descriptors.js';
import { formatFieldPath, parseFieldPath } from '@/fields/field-path.js';
import { flattenFieldNodes } from '@/fields/helpers.js';
import type { FieldDefinition, FieldPathSegment } from '@/types/fields.js';

/**
 * Field types whose entire value is prose an author wrote. Everything else —
 * references, numbers, dates, fixed option sets, identifiers such as `slug`,
 * `url` and `email`, and the structured types (`json`, `link`, `key-value`) —
 * is withheld whatever `paths` names.
 */
export const TEXT_BEARING_FIELD_TYPES: ReadonlySet<string> = new Set([
    'text',
    'textarea',
    'richtext',
]);

/** One eligible field, addressed by its instance path and its holding scope. */
export type RewriteTarget = {
    /** Instance path, e.g. `sections[a1].title`. */
    path: string;
    field: FieldDefinition;
    /** Root field name this target sits under — the key a patch has to carry. */
    root: string;
    /** The object holding the value; assign `scope[field.name]` to write back. */
    scope: Record<string, unknown>;
    value: unknown;
};

export type EligibilityOptions = {
    /** Restrict to these instance paths; a container path selects its subtree. */
    paths?: readonly string[] | undefined;
    /** Skip fields (and containers) the schema marks `translatable: false`. */
    skipNonTranslatable: boolean;
};

/**
 * Collect the eligible fields inside `values`, descending into nested fields.
 * They are normalized in place (the descriptor's `children` mints missing
 * item `_id`s), so `values` is the working copy a caller writes back.
 */
export function collectRewriteTargets(
    values: Record<string, unknown>,
    definitions: FieldDefinition[],
    options: EligibilityOptions
): RewriteTarget[] {
    // Parsed for the side effect: a malformed path is a caller bug, and matching
    // nothing silently is how it would otherwise surface.
    for (const path of options.paths ?? []) parseFieldPath(path);

    const targets: RewriteTarget[] = [];
    walkScope(values, definitions, [], options, targets);
    return targets;
}

/** Walk one value scope — the record root, or a container item / group object. */
function walkScope(
    values: Record<string, unknown>,
    definitions: FieldDefinition[],
    parentSegments: readonly FieldPathSegment[],
    options: EligibilityOptions,
    targets: RewriteTarget[]
): void {
    for (const field of flattenFieldNodes(definitions)) {
        if (field.private === true) continue;
        if (options.skipNonTranslatable && field.translatable === false) continue;

        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];
        const descriptor = getFieldTypeDescriptor(field.type);

        if (descriptor?.children !== undefined) {
            const { next, scopes } = descriptor.children(field, values[field.name]);
            values[field.name] = next;
            for (const scope of scopes) {
                walkScope(
                    scope.values,
                    scope.definitions,
                    [...parentSegments, ...scope.segments],
                    options,
                    targets
                );
            }
            continue;
        }

        if (!TEXT_BEARING_FIELD_TYPES.has(field.type)) continue;

        const path = formatFieldPath(segments);
        if (!pathSelected(path, options.paths)) continue;

        const root = segments[0];
        if (root === undefined || root.kind !== 'field') continue;
        targets.push({
            path,
            field,
            root: root.name,
            scope: values,
            value: values[field.name],
        });
    }
}

/**
 * Does `paths` select this field? A named container path selects everything
 * under it, so `sections` reaches `sections[a1].title`.
 */
function pathSelected(path: string, paths: readonly string[] | undefined): boolean {
    if (paths === undefined) return true;
    return paths.some(
        (candidate) =>
            path === candidate ||
            path.startsWith(`${candidate}.`) ||
            path.startsWith(`${candidate}[`)
    );
}
