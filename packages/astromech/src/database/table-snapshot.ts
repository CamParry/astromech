import type {
    ColumnKind,
    ColumnRuntime,
    IndexSpec,
    ReferenceTarget,
    Table,
} from '@/database/define-table';
import type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
    SqlDialect,
} from '@astromech/schema-engine';
import {
    capIdentifier,
    renderCreateIndex,
    renderCreateTable,
    renderTableStatements,
} from '@astromech/schema-engine';
import { AstromechError } from '@/errors/index';

/**
 * `Table` → snapshot conversion. `@astromech/schema-engine` owns the
 * `Snapshot` model, DDL renderers, differ and migration generator; this is
 * the thin, pure, browser-safe layer that turns a live `Table` into one.
 */

export type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
    SqlDialect,
};

/** camelCase column key → snake_case DDL identifier. */
export function toSnakeCase(key: string): string {
    return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const SQLITE_COLUMN_TYPE: Record<ColumnKind, 'text' | 'integer' | 'real'> = {
    id: 'text',
    text: 'text',
    integer: 'integer',
    real: 'real',
    boolean: 'integer',
    timestamp: 'text',
    json: 'text',
    enum: 'text',
    reference: 'text',
};

/** The SQL column type a column renders to, per dialect. */
export function columnType(
    column: ColumnRuntime,
    dialect: SqlDialect
): 'text' | 'integer' | 'real' {
    switch (dialect) {
        case 'sqlite':
            return SQLITE_COLUMN_TYPE[column.kind];
    }
}

/** Resolve a reference's target table + target (primary key) column. */
export function resolveReferenceTarget(target: ReferenceTarget): {
    table: string;
    column: string;
} {
    if (typeof target === 'string') return { table: target, column: 'id' };
    if (target.primaryKey !== undefined) {
        throw new AstromechError(
            `reference target "${target.name}" has a composite primary key ` +
                `(${target.primaryKey.join(', ')}); a single-column reference cannot ` +
                `address it. Reference a table with a single-column key instead.`
        );
    }
    const pkKey = Object.entries(target.columns).find(([, col]) => col.primaryKey)?.[0];
    if (pkKey === undefined) {
        throw new AstromechError(`reference target "${target.name}" has no primary key`);
    }
    return { table: target.name, column: toSnakeCase(pkKey) };
}

function normalizeDefault(value: string | number | boolean): string | number {
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function synthesizedIndexes(table: Table): IndexSpec[] {
    return Object.entries(table.columns)
        .filter(([, col]) => col.unique)
        .map(([key]) => ({
            name: `${table.name}_${toSnakeCase(key)}_unique`,
            columns: [key],
            unique: true,
        }));
}

/**
 * Every index a table renders — explicitly declared indexes first, then the
 * ones synthesized from column-level `unique: true`.
 *
 * Names are capped here, where they enter the *snapshot*, never at render time:
 * the differ compares snapshots, so a capped render against an uncapped
 * snapshot would diff on every run and churn a migration each time.
 */
export function allIndexes(table: Table): IndexSpec[] {
    return [...table.indexes, ...synthesizedIndexes(table)].map((spec) => ({
        ...spec,
        name: capIdentifier(spec.name),
    }));
}

/**
 * Convert a `Table` into its DDL-affecting snapshot shape (column/FK/index
 * data only — no app-side codec facts). The shared input to both
 * `createSnapshot` (for diffing) and the emit wrappers below, so both never
 * define "a table's DDL shape" differently.
 */
export function toSnapshotTable(table: Table, dialect: SqlDialect): SnapshotTable {
    const cols = Object.entries(table.columns);

    const columns: SnapshotColumn[] = cols.map(([key, col]) => ({
        key,
        name: toSnakeCase(key),
        kind: col.kind,
        type: columnType(col, dialect),
        notNull: col.notNull,
        primaryKey: col.primaryKey,
        ...(col.sqlDefault !== undefined && {
            default: normalizeDefault(col.sqlDefault),
        }),
        ...(col.enumValues !== undefined && { enumValues: col.enumValues }),
    }));

    const fks: SnapshotForeignKey[] = [];
    for (const [key, col] of cols) {
        if (!col.reference) continue;
        const target = resolveReferenceTarget(col.reference.target());
        fks.push({
            column: toSnakeCase(key),
            targetTable: target.table,
            targetColumn: target.column,
            onDelete: col.reference.onDelete,
        });
    }

    const indexes: SnapshotIndex[] = allIndexes(table).map((idx) => ({
        name: idx.name,
        columns: idx.columns.map(toSnakeCase),
        unique: idx.unique,
        ...(idx.where !== undefined && { where: idx.where }),
    }));

    // Key position is fixed so a snapshot re-serializes byte-identically, and
    // omitted entirely without a composite key so pre-existing snapshots and
    // their DDL are untouched.
    return {
        name: table.name,
        columns,
        ...(table.primaryKey !== undefined && {
            primaryKey: table.primaryKey.map(toSnakeCase),
        }),
        fks,
        indexes,
    };
}

/** Build a deterministic snapshot of the given tables' DDL-affecting state. */
export function createSnapshot(tables: Table[], opts: { dialect: SqlDialect }): Snapshot {
    const entries = tables
        .map((table): [string, SnapshotTable] => [
            table.name,
            toSnapshotTable(table, opts.dialect),
        ])
        .sort(([a], [b]) => a.localeCompare(b));
    return {
        version: 1,
        dialect: opts.dialect,
        tables: Object.fromEntries(entries),
    };
}

/** Render a table's `CREATE TABLE` statement (columns, then table-level FKs,
 *  in column declaration order). */
export function emitCreateTable(table: Table, dialect: SqlDialect): string {
    return renderCreateTable(toSnapshotTable(table, dialect));
}

/** Render a table's index statements — explicit indexes then synthesized
 *  column-unique indexes. */
export function emitCreateIndexes(table: Table, dialect: SqlDialect): string[] {
    const snap = toSnapshotTable(table, dialect);
    return snap.indexes.map((idx) => renderCreateIndex(snap.name, idx));
}

/** Render a table's full statement set: `CREATE TABLE` first, then indexes. */
export function emitTableStatements(table: Table, dialect: SqlDialect): string[] {
    return renderTableStatements(toSnapshotTable(table, dialect));
}
