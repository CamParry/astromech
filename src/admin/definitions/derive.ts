import type {
    AdminEntryTypeConfig,
    FormDefinition,
    TableColumn,
    TableDefinition,
} from '@/types/index.js';
import { defaultCellKind } from './cell-kind-map.js';

/** Resolve a field's declared type by scanning the config's field groups. */
export function fieldTypeOf(config: AdminEntryTypeConfig, fieldName: string): string {
    for (const group of config.fieldGroups) {
        const f = group.fields.find((x) => x.name === fieldName);
        if (f) return f.type;
    }
    return 'text';
}

export function deriveTableDefinition(config: AdminEntryTypeConfig): TableDefinition {
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

    return { type: config.single, columns };
}

export function deriveFormDefinition(config: AdminEntryTypeConfig): FormDefinition {
    return {
        type: config.single,
        hasTitle: config.titleField !== false,
        hasSlug: config.capabilities.slug && config.slug != null,
        hasStatuses: config.capabilities.statuses,
        mainGroups: config.fieldGroups.filter(
            (g) => g.placement !== 'sidebar' && g.placement !== 'tab'
        ),
        sidebarGroups: config.fieldGroups.filter((g) => g.placement === 'sidebar'),
        tabGroups: config.fieldGroups.filter((g) => g.placement === 'tab'),
    };
}

/**
 * Resolve a full AdminEntryTypeConfig for derivation, defaulting an absent
 * config to the current built-in behaviour (title on, statuses on, slug off
 * since slug config is null, no i18n, no admin columns).
 */
export function resolveConfigForDerive(
    config: AdminEntryTypeConfig | undefined,
    type: string
): AdminEntryTypeConfig {
    return (
        config ?? {
            single: type,
            plural: type,
            versioning: false,
            translatable: false,
            slug: null,
            adminColumns: [],
            fieldGroups: [],
            previewUrl: null,
            capabilities: {
                statuses: true,
                slug: true,
                translatable: false,
                versioning: false,
                trash: true,
            },
            titleField: 'title',
        }
    );
}
