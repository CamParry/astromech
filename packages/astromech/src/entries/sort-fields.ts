/**
 * The fields an entries list may order by besides its system columns: each
 * top-level field whose type is `sortable`, by its bare name, the name an admin
 * column reads. `entries.query` passes them to the repository, and config
 * resolve checks a `sortable` admin column against them
 * (`config/entry-types.ts`).
 */

import type { VisibilityShape } from '@/content/visibility';
import type { ResolvedEntryFields } from '@/types/fields';
import type { ResolvedConfig } from '@/types/index';
import { sortableColumns } from '@/content/resources';
import { resolveEntryType } from '@/entries/entry-types';
import { getFieldType } from '@/fields/field-type-registry';
import { flattenEntryFields } from '@/fields/flatten';

/**
 * The top-level fields of one type a list may order by. A field named like a
 * system column (`title`, `slug`, ...) is left out, since a sort by that name
 * orders by the column. A public read leaves out `private` fields too, since
 * the order would show their values. A name holding `"` cannot be quoted in a
 * JSON path, so it is left out as well.
 */
export function sortableFieldNames(
    fields: ResolvedEntryFields,
    shape: VisibilityShape
): string[] {
    const system = sortableColumns('entry');
    return flattenEntryFields(fields)
        .filter(
            (field) =>
                getFieldType(field.type)?.sortable === true &&
                !system.includes(field.name) &&
                !field.name.includes('"') &&
                !(shape === 'public' && field.private === true)
        )
        .map((field) => field.name);
}

/**
 * The fields a list over `types` may order by: those every type declares as
 * sortable, so no row of the list lacks a declared value.
 */
export function sharedSortableFields(
    config: Pick<ResolvedConfig, 'entryTypes'>,
    types: readonly string[],
    shape: VisibilityShape
): string[] {
    const perType = types.map((type) => {
        const entryType = resolveEntryType(config, type);
        return entryType ? sortableFieldNames(entryType.fields, shape) : [];
    });
    const [first = [], ...rest] = perType;
    return first.filter((name) => rest.every((names) => names.includes(name)));
}
