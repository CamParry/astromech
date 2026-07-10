/**
 * Snapshot serialiser — a descriptor set's DDL-affecting state, as data.
 *
 * Captures exactly what determines a table's shape on disk: column storage
 * type/nullability/primary-key/SQL-default/enum values, foreign keys, and
 * indexes (explicit + the unique indexes `ddl.ts` synthesizes from
 * column-level `unique: true`). Step 4 diffs two snapshots to generate
 * migrations, so app-side-only facts (`appDefault`, `onUpdate`,
 * `serialize`/`parse`) are deliberately excluded here — they never affect
 * DDL, and including them would trigger a migration diff on a purely
 * app-side change.
 *
 * Deterministic: tables sorted by name, columns/indexes kept in each
 * descriptor's declaration order (the source of step 4's rebuild column
 * mapping), `serializeSnapshot` a plain stable `JSON.stringify`. No
 * `id`/`prevId` chain yet — that's step 4's journal format.
 */

import {
    allIndexes,
    columnType,
    resolveReferenceTarget,
    toSnakeCase,
    type SqlDialect,
} from '@/database/ddl.js';
import type { ColumnKind, OnDelete, TableDescriptor } from '@/database/define-table.js';

export type SnapshotColumn = {
    key: string;
    name: string;
    kind: ColumnKind;
    type: 'text' | 'integer' | 'real';
    notNull: boolean;
    primaryKey: boolean;
    default?: string | number;
    enumValues?: readonly string[];
};

export type SnapshotForeignKey = {
    column: string;
    targetTable: string;
    targetColumn: string;
    onDelete: OnDelete;
};

export type SnapshotIndex = {
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
};

export type SnapshotTable = {
    name: string;
    columns: SnapshotColumn[];
    fks: SnapshotForeignKey[];
    indexes: SnapshotIndex[];
};

export type Snapshot = {
    version: 1;
    dialect: SqlDialect;
    tables: Record<string, SnapshotTable>;
};

function normalizeDefault(value: string | number | boolean): string | number {
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function snapshotTable(table: TableDescriptor, dialect: SqlDialect): SnapshotTable {
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
            snapshotTable(table, opts.dialect),
        ])
        .sort(([a], [b]) => a.localeCompare(b));
    return {
        version: 1,
        dialect: opts.dialect,
        tables: Object.fromEntries(entries),
    };
}

/** Stable JSON rendering of a snapshot (same input → identical output). */
export function serializeSnapshot(snapshot: Snapshot): string {
    return JSON.stringify(snapshot, null, 2);
}
