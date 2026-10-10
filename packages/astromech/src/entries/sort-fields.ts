/**
 * The fields an entries list may order by besides its system columns: each
 * top-level field whose type is `sortable`, by its bare name, the name an admin
 * column reads. `entries.query` passes them to the repository, and config
 * resolve checks a `sortable` admin column against them.
 */

import type { VisibilityShape } from '@/content/visibility';
import type { ResolvedEntryFields } from '@/types/fields';
import type { AdminColumn, ResolvedConfig } from '@/types/index';
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

/**
 * Throw when an admin column asks for a sort the entries list would refuse, or
 * would apply to the system column rather than the field the column shows, so
 * the admin never offers one. `owner` names the type in the message.
 */
export function assertSortableColumns(
    owner: string,
    columns: readonly AdminColumn[],
    fields: ResolvedEntryFields
): void {
    const sortable = sortableFieldNames(fields, 'full');
    for (const column of columns) {
        if (column.sortable !== true || sortable.includes(column.field)) continue;
        const prefix = `Astromech ${owner}: admin column "${column.field}" is sortable, but`;
        if (sortableColumns('entry').includes(column.field)) {
            throw new Error(
                `${prefix} a sort by "${column.field}" orders by the entry's own ` +
                    `\`${column.field}\` column, not the field the column shows. ` +
                    'Rename the field, or drop `sortable`.'
            );
        }
        const declared = flattenEntryFields(fields).find(
            (field) => field.name === column.field
        );
        throw new Error(
            `${prefix} ` +
                (declared === undefined
                    ? 'the type declares no top-level field by that name.'
                    : `a \`${declared.type}\` field holds no single value a list can order by.`) +
                ` Sortable fields: ${sortable.length > 0 ? sortable.map((name) => `"${name}"`).join(', ') : 'none'}.`
        );
    }
}
