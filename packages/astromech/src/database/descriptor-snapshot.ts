/**
 * Descriptor → snapshot conversion — the CMS half of the old `ddl.ts`.
 *
 * `@astromech/schema-engine` owns everything below this line: the `Snapshot`
 * model, the DDL renderers, the differ, the migration generator. This module is
 * the thin layer that turns a live `TableDescriptor` into the plain snapshot
 * data the engine consumes, and re-exposes the engine's descriptor-in
 * convenience wrappers (`emitCreateTable`/`emitCreateIndexes`/
 * `emitTableStatements`).
 *
 * `createSnapshot` captures exactly what determines a table's shape on disk:
 * column storage type/nullability/primary-key/SQL-default/enum values, foreign
 * keys, and indexes (explicit + the unique indexes synthesized from
 * column-level `unique: true`). App-side-only facts (`appDefault`, `onUpdate`,
 * `serialize`/`parse`) are deliberately excluded — they never affect DDL, and
 * including them would trigger a migration diff on a purely app-side change.
 *
 * Deterministic: tables sorted by name, columns/indexes kept in each
 * descriptor's declaration order (the source of the migration generator's
 * rebuild column mapping).
 *
 * Pure and browser-safe (no db imports). Every function takes a `SqlDialect`
 * tag rather than inspecting a driver — the seam a Postgres emitter slots into
 * later.
 */

import {
    renderCreateIndex,
    renderCreateTable,
    renderTableStatements,
    type Snapshot,
    type SnapshotColumn,
    type SnapshotForeignKey,
    type SnapshotIndex,
    type SnapshotTable,
    type SqlDialect,
} from '@astromech/schema-engine';
import type {
    ColumnKind,
    IndexSpec,
    ReferenceTarget,
    TableDescriptor,
} from '@/database/define-table.js';

export type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
    SqlDialect,
};

/** camelCase descriptor key → snake_case DDL identifier. */
export function toSnakeCase(key: string): string {
    return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const SQLITE_STORAGE_TYPE: Record<ColumnKind, 'text' | 'integer' | 'real'> = {
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

/** The storage column type a column kind renders to, per dialect. */
export function columnType(
    kind: ColumnKind,
    dialect: SqlDialect
): 'text' | 'integer' | 'real' {
    switch (dialect) {
        case 'sqlite':
            return SQLITE_STORAGE_TYPE[kind];
    }
}

/** Resolve a reference's target table + target (primary key) column. */
export function resolveReferenceTarget(target: ReferenceTarget): {
    table: string;
    column: string;
} {
    if (typeof target === 'string') return { table: target, column: 'id' };
    const pkKey = Object.entries(target.columns).find(([, col]) => col.primaryKey)?.[0];
    if (pkKey === undefined) {
        throw new Error(
            `[Astromech] reference target "${target.name}" has no primary key`
        );
    }
    return { table: target.name, column: toSnakeCase(pkKey) };
}

function normalizeDefault(value: string | number | boolean): string | number {
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function synthesizedIndexes(table: TableDescriptor): IndexSpec[] {
    return Object.entries(table.columns)
        .filter(([, col]) => col.unique)
        .map(([key]) => ({
            name: `${table.name}_${toSnakeCase(key)}_unique`,
            columns: [key],
            unique: true,
        }));
}

/** Every index a table renders — explicit descriptor indexes first, then the
 *  ones synthesized from column-level `unique: true`. */
export function allIndexes(table: TableDescriptor): IndexSpec[] {
    return [...table.indexes, ...synthesizedIndexes(table)];
}

/**
 * Convert a descriptor into its DDL-affecting snapshot shape (column/FK/index
 * data only — no app-side codec facts). The shared input to both
 * `createSnapshot` (for diffing) and the emit wrappers below, so both never
 * define "a table's DDL shape" differently.
 */
export function descriptorToSnapshotTable(
    table: TableDescriptor,
    dialect: SqlDialect
): SnapshotTable {
    const cols = Object.entries(table.columns);

    const columns: SnapshotColumn[] = cols.map(([key, col]) => ({
        key,
        name: toSnakeCase(key),
        kind: col.kind,
        type: columnType(col.kind, dialect),
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

    return { name: table.name, columns, fks, indexes };
}

/** Build a deterministic snapshot of the given descriptors' DDL-affecting state. */
export function createSnapshot(
    tables: TableDescriptor[],
    opts: { dialect: SqlDialect }
): Snapshot {
    const entries = tables
        .map((table): [string, SnapshotTable] => [
            table.name,
            descriptorToSnapshotTable(table, opts.dialect),
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
export function emitCreateTable(table: TableDescriptor, dialect: SqlDialect): string {
    return renderCreateTable(descriptorToSnapshotTable(table, dialect));
}

/** Render a table's index statements — explicit indexes then synthesized
 *  column-unique indexes. */
export function emitCreateIndexes(table: TableDescriptor, dialect: SqlDialect): string[] {
    const snap = descriptorToSnapshotTable(table, dialect);
    return snap.indexes.map((idx) => renderCreateIndex(snap.name, idx));
}

/** Render a table's full statement set: `CREATE TABLE` first, then indexes. */
export function emitTableStatements(
    table: TableDescriptor,
    dialect: SqlDialect
): string[] {
    return renderTableStatements(descriptorToSnapshotTable(table, dialect));
}
