import type { ResolvedForm, ResolvedTable, TableColumn } from './types';
import type { AdminEntryType } from 'astromech';
import { flattenEntryFields } from 'astromech/shared';
import { defaultCellKind } from './cell-kind-map';

/**
 * The declared type of a top-level field. Config resolve refuses an admin
 * column or grid field that names no such field, so one is always found.
 */
export function fieldTypeOf(config: AdminEntryType, fieldName: string): string {
    const f = flattenEntryFields(config.fields).find((x) => x.name === fieldName);
    if (f === undefined) {
        throw new Error(
            `[Astromech] ${config.single} declares no top-level field "${fieldName}".`
        );
    }
    return f.type;
}

/** The `key` of a column over the field `name`, unlike any system column's. */
export function fieldColumnKey(name: string): string {
    return `fields.${name}`;
}

export function resolveTable(config: AdminEntryType): ResolvedTable {
    const columns: TableColumn[] = [];
    const caps = config.capabilities;

    // System columns first, each gated declaratively by `requires`.
    if (config.titleField !== false) {
        columns.push({
            key: 'title',
            name: 'title',
            label: 'entries.columnTitle',
            kind: 'title',
            source: 'entry',
            sortable: true,
            system: true,
            requires: 'title',
        });
    }
    if (caps.statuses) {
        columns.push({
            key: 'status',
            name: 'status',
            label: 'entries.columnStatus',
            kind: 'status',
            source: 'entry',
            sortable: true,
            system: true,
            requires: 'statuses',
        });
    }
    if (caps.slug) {
        columns.push({
            key: 'slug',
            name: 'slug',
            label: 'entries.columnSlug',
            kind: 'slug',
            source: 'entry',
            sortable: true,
            system: true,
            requires: 'slug',
        });
    }
    if (caps.translatable) {
        columns.push({
            key: 'locale',
            name: 'locale',
            label: 'entries.columnLocale',
            kind: 'locale',
            source: 'entry',
            sortable: false,
            system: true,
            requires: 'locale',
        });
        columns.push({
            key: 'translations',
            name: 'translations',
            label: 'entries.columnTranslations',
            kind: 'translations',
            source: 'entry',
            sortable: false,
            system: true,
            requires: 'translatable',
        });
    }

    // Configured admin columns (field data).
    for (const col of config.adminColumns) {
        columns.push({
            key: fieldColumnKey(col.field),
            name: col.field,
            label: col.label ?? col.field,
            kind: col.kind ?? defaultCellKind(fieldTypeOf(config, col.field)),
            source: 'field',
            sortable: col.sortable ?? false,
            system: false,
            requires: null,
        });
    }

    // Updated-at trailing system column.
    columns.push({
        key: 'updatedAt',
        name: 'updatedAt',
        label: 'entries.columnUpdated',
        kind: 'date',
        source: 'entry',
        sortable: true,
        system: true,
        requires: null,
    });
    columns.push({
        key: 'updatedBy',
        name: 'updatedBy',
        label: 'entries.columnUpdatedBy',
        kind: 'author',
        source: 'entry',
        sortable: false,
        system: true,
        requires: null,
    });

    return { type: config.single, columns };
}

export function resolveForm(config: AdminEntryType): ResolvedForm {
    return {
        type: config.single,
        hasTitle: config.titleField !== false,
        hasSlug: config.capabilities.slug,
        hasStatuses: config.capabilities.statuses,
        main: config.fields.main,
        sidebar: config.fields.sidebar,
    };
}
