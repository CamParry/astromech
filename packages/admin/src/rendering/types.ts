/**
 * Resolved rendering contracts: JSON-serializable shapes for admin entry
 * pages, resolved client-side from `AdminEntryType`. Renderers are referenced
 * by string key, never by component reference, so they stay serializable.
 */
import type { CellKind, Entry, Field, Label } from 'astromech';
import type * as React from 'react';

export type TableColumn = {
    /**
     * Unique among a list's columns: a system column's name, or `fields.` and
     * the field's name, the path its value has in the entry. React keys and the
     * shown-columns setting use it, so a field named like a system column, such
     * as `title`, stays a column of its own.
     */
    key: string;
    /** The name the value is read under in `source`, and the name a sort sends. */
    name: string;
    /**
     * System columns carry an i18n key (shell calls `t()`); admin columns carry
     * a `Label` (literal string or a `t()` descriptor), resolved at render.
     */
    label: Label;
    kind: CellKind;
    /** 'field' reads entry.fields[name]; 'entry' reads (entry as Record)[name]. */
    source: 'field' | 'entry';
    sortable: boolean;
    /** True for the built-in system columns (title/status/slug/locale/translations/updatedAt/updatedBy). */
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
    /** Names by user id, for the author columns; empty when unreadable. */
    authorNames: Map<string, string>;
};
/** What a cell renderer receives: the row, which is an entry unless a caller says otherwise. */
export type CellRendererProps<Row = Entry> = {
    row: Row;
    column: TableColumn;
    value: unknown;
    ctx: CellRenderContext;
};
export type CellRenderer<Row = Entry> = (
    props: CellRendererProps<Row>
) => React.ReactNode;
