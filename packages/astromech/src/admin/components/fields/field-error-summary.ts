/**
 * Turns a validation error map into one sentence an author can act on, by
 * walking the `_id` path grammar back through the field tree to the labels
 * the schema author actually wrote. Pure module — no React, no DOM.
 */

import type { Field, FieldErrors, Label } from '@/types/index';
import type { TFunction } from 'i18next';
import { titleCase } from '@/admin/i18n/labels';
// Deep imports: the `fields/` barrel reaches server code (virtual config / DB).
import { parseInstancePath } from '@/fields/field-path';
import { flattenFieldNodes } from '@/fields/flatten';

/** How many fields the summary names before it starts counting. */
const NAMED_LIMIT = 3;

/** Joins the labels of one nested path: `Sections → Items → Title`. */
const CHAIN_SEPARATOR = ' → ';

/** Joins one named field to the next. */
const LIST_SEPARATOR = ', ';

/** The declared label of a field, or the same fallback its own label renders. */
function labelOf(field: Field): Label {
    return field.label ?? titleCase(field.name);
}

/**
 * The fields a path may continue into from `field`, or `null` when the step
 * is unresolvable. A `blocks` item's type lives in the value, not the path,
 * so every block definition is a candidate; the step is safe only when they agree.
 */
function childrenOf(field: Field): Field[] | null {
    if (field.fields !== undefined) return flattenFieldNodes(field.fields);
    if (field.blocks !== undefined) {
        return field.blocks.flatMap((block) => flattenFieldNodes(block.fields));
    }
    return null;
}

/**
 * Resolve an error path back to the field's declared label chain (e.g.
 * `Sections → Title`). Returns `null` when the path can't be resolved — a
 * malformed path, an undeclared field, or an ambiguous `blocks` step.
 */
export function fieldLabelPathForError(
    definitions: Field[],
    path: string
): Label[] | null {
    let segments;
    try {
        segments = parseInstancePath(path);
    } catch {
        return null;
    }

    const labels: Label[] = [];
    let candidates: Field[] | null = flattenFieldNodes(definitions);

    for (const segment of segments) {
        // An item id names a row, not a definition; the definition is the same
        // whichever row erred.
        if (segment.kind === 'item') continue;
        if (candidates === null) return null;

        const matches = candidates.filter((field) => field.name === segment.name);
        const first = matches[0];
        if (first === undefined) return null;

        const label = labelOf(first);
        // Only a `blocks` step can produce more than one match. Two block types
        // declaring the same field under the same label are interchangeable here;
        // disagreeing ones are not, and a guess would name the wrong field.
        if (matches.some((field) => !sameLabel(labelOf(field), label))) return null;

        labels.push(label);
        candidates = childrenOf(first);
    }

    return labels.length > 0 ? labels : null;
}

function sameLabel(a: Label, b: Label): boolean {
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    return a.$t === b.$t;
}

/**
 * Build the toast shown when a submit is refused: name the failing fields, up
 * to `NAMED_LIMIT`, then count the rest. `names` are already display strings
 * resolved by the caller.
 */
export function validationSummaryMessage(names: string[], t: TFunction): string {
    if (names.length === 0) return t('entries.fixFieldsUnnamed');

    const named = names.slice(0, NAMED_LIMIT).join(LIST_SEPARATOR);
    const remaining = names.length - NAMED_LIMIT;
    if (remaining <= 0) return t('entries.fixFields', { fields: named });
    return t('entries.fixFieldsMore', { fields: named, count: remaining });
}

/**
 * The display name of every field in an error map, in map order — a resolved
 * label chain where the path resolves, the raw path where it does not.
 */
export function fieldErrorNames(
    errors: FieldErrors,
    definitions: Field[],
    resolve: (label: Label) => string
): string[] {
    return Object.keys(errors).map((path) => {
        const chain = fieldLabelPathForError(definitions, path);
        if (chain === null) return path;
        return chain.map(resolve).join(CHAIN_SEPARATOR);
    });
}
