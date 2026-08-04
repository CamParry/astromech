/**
 * Turning a validation error map into one sentence an author can act on.
 *
 * The error map keys on the `_id` path grammar (`sections[a1].items[b2].title`),
 * which is addressing, not language: it names container ITEMS by their persisted
 * id, and it carries a field's declared name rather than its label. A summary
 * built straight from those keys would be no more use than the fixed string it
 * replaces, so the path is walked back through the field tree to the labels the
 * schema author actually wrote.
 *
 * Pure module — no React, no `t` binding, no DOM. The caller owns resolving a
 * `Label` against its namespace and owns the `t` used for the sentence itself.
 */

import type { TFunction } from 'i18next';
import type { FieldDefinition, FieldErrors, Label } from '@/types/index.js';
// Deep imports: the `fields/` barrel reaches server code (virtual config / DB).
import { parseInstancePath } from '@/fields/field-path.js';
import { flattenFieldNodes } from '@/fields/helpers.js';
import { titleCase } from '@/admin/i18n/labels.js';

/** How many fields the summary names before it starts counting. */
const NAMED_LIMIT = 3;

/** Joins the labels of one nested path: `Sections → Items → Title`. */
const CHAIN_SEPARATOR = ' → ';

/** Joins one named field to the next. */
const LIST_SEPARATOR = ', ';

// ============================================================================
// Path → labels
// ============================================================================

/** The declared label of a field, or the same fallback its own label renders. */
function labelOf(field: FieldDefinition): Label {
    return field.label ?? titleCase(field.name);
}

/**
 * The fields a path may continue into from `field`, or `null` when the step is
 * unresolvable.
 *
 * `group`/`repeater`/`tree` declare one child list, so the step is exact. A
 * `blocks` item's type lives in the VALUE (`_type`), which a path does not
 * carry, so every block definition is a candidate — the step is only safe when
 * they agree on what the next name means.
 */
function childrenOf(field: FieldDefinition): FieldDefinition[] | null {
    if (field.fields !== undefined) return flattenFieldNodes(field.fields);
    if (field.blocks !== undefined) {
        return field.blocks.flatMap((block) => flattenFieldNodes(block.fields));
    }
    return null;
}

/**
 * Resolve an error path back to the field's declared label.
 *
 * Errors key on the `_id` path grammar, which names container ITEMS by their
 * persisted id — meaningless to an author. Only the `field` segments identify
 * a definition, so item segments are stepped over: `sections[a1].title`
 * resolves through `sections` to `title`.
 *
 * Returns the whole chain, so the caller can render `Sections → Title` or just
 * the last label. `null` means the path could not be resolved — a malformed
 * path, a field the admin config does not declare, or a `blocks` step whose
 * candidate definitions disagree — and the caller should fall back to the path
 * itself rather than print a guess.
 */
export function fieldLabelPathForError(
    definitions: FieldDefinition[],
    path: string
): Label[] | null {
    let segments;
    try {
        segments = parseInstancePath(path);
    } catch {
        return null;
    }

    const labels: Label[] = [];
    let candidates: FieldDefinition[] | null = flattenFieldNodes(definitions);

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

// ============================================================================
// Labels → sentence
// ============================================================================

/**
 * Build the toast shown when a submit is refused: name the failing fields, up
 * to `NAMED_LIMIT`, then count the rest.
 *
 * `names` are already display strings — the caller resolved each `Label` chain
 * against the right namespace, or fell back to the raw path.
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
    definitions: FieldDefinition[],
    resolve: (label: Label) => string
): string[] {
    return Object.keys(errors).map((path) => {
        const chain = fieldLabelPathForError(definitions, path);
        if (chain === null) return path;
        return chain.map(resolve).join(CHAIN_SEPARATOR);
    });
}
