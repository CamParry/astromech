import type { AdminEntryType, ResolvedForm, ResolvedTable, TableColumn } from 'astromech';
import { flattenEntryFields } from 'astromech/shared';
import { defaultCellKind } from './cell-kind-map';

/** Resolve a field's declared type by scanning the config's field tree. */
export function fieldTypeOf(config: AdminEntryType, fieldName: string): string {
    const f = flattenEntryFields(config.fields).find((x) => x.name === fieldName);
    return f ? f.type : 'text';
}

export function resolveTable(config: AdminEntryType): ResolvedTable {
    const columns: TableColumn[] = [];
    const caps = config.capabilities;

    // System columns first, each gated declaratively by `requires`.
    if (config.titleField !== false) {
        columns.push({
            key: 'title',
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
            label: 'entries.columnStatus',
            kind: 'badge',
            source: 'entry',
            sortable: false,
            system: true,
            requires: 'statuses',
        });
    }
    if (caps.slug) {
        columns.push({
            key: 'slug',
            label: 'entries.columnSlug',
            kind: 'slug',
            source: 'entry',
            sortable: false,
            system: true,
            requires: 'slug',
        });
    }
    if (caps.translatable) {
        columns.push({
            key: 'locale',
            label: 'entries.columnLocale',
            kind: 'locale',
            source: 'entry',
            sortable: false,
            system: true,
            requires: 'locale',
        });
        columns.push({
            key: 'translations',
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
            key: col.field,
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
        label: 'entries.columnUpdated',
        kind: 'date',
        source: 'entry',
        sortable: true,
        system: true,
        requires: null,
    });
    columns.push({
        key: 'updatedBy',
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
        hasSlug: config.capabilities.slug && config.slug != null,
        hasStatuses: config.capabilities.statuses,
        main: config.fields.main,
        sidebar: config.fields.sidebar,
    };
}
