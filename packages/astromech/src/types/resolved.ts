/**
 * Resolved rendering contracts — JSON-serializable shapes for admin entry pages.
 *
 * They are resolved (client-side) from AdminEntryTypeConfig and reference
 * renderers by STRING KEY (cell kind, field type), never by component reference,
 * so they stay serializable. The admin registries resolve those keys to React
 * components. See src/admin/rendering/.
 *
 * Dependency rule: this module imports only ./fields.js and ./domain.js — never
 * ./config.js (config.ts imports CellKind from here; the dependency is one-way).
 */
import type * as React from 'react';
import type { Entry } from './domain.js';
import type { Field, Label } from './fields.js';

export const CELL_KINDS = [
    'text',
    'title',
    'badge',
    'slug',
    'date',
    'boolean',
    'number',
    'relationship',
    'locale',
    'translations',
] as const;
export type CellKind = (typeof CELL_KINDS)[number];

export type TableColumn = {
    /** Stable key — field name for field columns, system key for system columns. */
    key: string;
    /**
     * System columns carry an i18n key (shell calls `t()`); admin columns carry
     * a `Label` (literal string or a `t()` descriptor), resolved at render.
     */
    label: Label;
    kind: CellKind;
    /** 'field' reads entry.fields[key]; 'entry' reads (entry as Record)[key]. */
    source: 'field' | 'entry';
    sortable: boolean;
    /** True for the built-in system columns (title/status/slug/locale/translations/updatedAt). */
    system: boolean;
    /** Declarative capability/visibility gate; the page shell evaluates it against runtime state. */
    requires?: 'statuses' | 'slug' | 'translatable' | 'title' | 'locale' | null;
};

export type ResolvedTable = {
    type: string;
    columns: TableColumn[];
};

export type ResolvedForm = {
    type: string;
    hasTitle: boolean;
    hasSlug: boolean;
    hasStatuses: boolean;
    /** Recursive field tree for the main (left) column. */
    main: Field[];
    /** Recursive field tree for the sidebar (right) column. */
    sidebar: Field[];
};

export type CellRenderContext = {
    basePath: string;
    configuredLocales: string[];
    isTrash: boolean;
};
export type CellRendererProps = {
    entry: Entry;
    column: TableColumn;
    value: unknown;
    ctx: CellRenderContext;
};
export type CellRenderer = (props: CellRendererProps) => React.ReactNode;
