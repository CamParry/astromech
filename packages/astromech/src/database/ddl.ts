/**
 * DDL emitter — `TableDescriptor` → `CREATE TABLE` / `CREATE INDEX` SQL.
 *
 * Pure, browser-safe (no db imports). Renders in the same style as the
 * hand-authored baseline (`apps/demo/migrations/0000_baseline.ts`):
 * backtick-quoted identifiers, 4-space-indented multi-line `CREATE TABLE`, one
 * column per line, table-level `FOREIGN KEY` clauses. Column-level
 * `unique: true` synthesizes a `CREATE UNIQUE INDEX` (never an inline SQL
 * `UNIQUE`) so a column-unique and an explicit named index never diverge in
 * shape.
 *
 * Two render paths funnel through the SAME statement renderers
 * (`renderCreateTable`/`renderCreateIndex`), which operate on the plain
 * `Snapshot*` data shapes (`snapshot.ts`), not on live descriptors:
 *   - the descriptor path (`emitCreateTable`/`emitCreateIndexes`/
 *     `emitTableStatements`) converts a descriptor to its snapshot shape
 *     (`descriptorToSnapshotTable`) and renders that;
 *   - the migration generator (`diff.ts` + `migration-render.ts`) diffs two
 *     snapshots and renders the resulting `TableOp`s the same way.
 * So the two paths can never silently drift apart (the pre-step-4 drift gate
 * asserted this by parity test; step 4 makes it structural).
 *
 * `snapshot.ts` imports RUNTIME functions from this module (`columnType`,
 * `allIndexes`, `resolveReferenceTarget`, `toSnakeCase`, `descriptorToSnapshotTable`).
 * The `Snapshot*` types below therefore live HERE, not in `snapshot.ts` — a
 * reverse type-only import back would still read as a cycle to
 * dependency-cruiser (`tsPreCompilationDeps: true` tracks type-only edges
 * too, even though `verbatimModuleSyntax` erases them at runtime).
 * `snapshot.ts` re-exports these types for its existing consumers (`diff.ts`,
 * `generator.ts`, tests) — import them from either module.
 *
 * Every function takes/keys off a `SqlDialect` tag rather than inspecting a
 * driver — the seam a Postgres emitter slots into later.
 */

import type {
    ColumnKind,
    IndexSpec,
    OnDelete,
    ReferenceTarget,
    TableDescriptor,
} from '@/database/define-table.js';

export type SqlDialect = 'sqlite';

// ============================================================================
// Snapshot shapes — a descriptor set's DDL-affecting state, as data. See
// `snapshot.ts` for the descriptor→snapshot-set builder (`createSnapshot`);
// defined here so `descriptorToSnapshotTable`/the renderers below don't need
// a reverse import (see header comment).
// ============================================================================

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

function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Render a SQL-literal `DEFAULT`/`COALESCE` value (string/number/boolean). */
export function renderLiteral(value: string | number | boolean): string {
    if (typeof value === 'string') return quoteLiteral(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
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
 * `createSnapshot` (`snapshot.ts`, for diffing) and the statement renderers
 * below (for descriptor-path emit), so both never define "a table's DDL
 * shape" differently.
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

/** Render one column's clause: `` `name` type [PRIMARY KEY] [DEFAULT lit]
 *  [NOT NULL] [CHECK …] ``. Shared by `renderCreateTable` and the migration
 *  generator's `ADD COLUMN` rendering (`migration-render.ts`). */
export function renderColumnClause(col: SnapshotColumn): string {
    const parts = [`\`${col.name}\``, col.type];
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (col.default !== undefined) parts.push(`DEFAULT ${renderLiteral(col.default)}`);
    if (col.notNull) parts.push('NOT NULL');
    if (col.kind === 'enum' && col.enumValues !== undefined) {
        const values = col.enumValues.map(quoteLiteral).join(', ');
        parts.push(`CHECK (\`${col.name}\` IN (${values}))`);
    }
    return parts.join(' ');
}

function renderForeignKeyClause(fk: SnapshotForeignKey): string {
    return (
        `FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.targetTable}\`(\`${fk.targetColumn}\`) ` +
        `ON UPDATE no action ON DELETE ${fk.onDelete}`
    );
}

/** Render a table's `CREATE TABLE` statement from its snapshot shape —
 *  columns then table-level FKs, in column declaration order. The single
 *  source of `CREATE TABLE` rendering; every path (descriptor emit, migration
 *  generator) funnels through this. */
export function renderCreateTable(table: SnapshotTable): string {
    const columnLines = table.columns.map(renderColumnClause);
    const fkLines = table.fks.map(renderForeignKeyClause);
    const lines = [...columnLines, ...fkLines].map((line) => `    ${line}`);
    return `CREATE TABLE \`${table.name}\` (\n${lines.join(',\n')}\n)`;
}

/** Render one `CREATE [UNIQUE] INDEX` statement from its snapshot shape. The
 *  single source of index rendering; every path funnels through this. */
export function renderCreateIndex(tableName: string, idx: SnapshotIndex): string {
    const columns = idx.columns.map((c) => `\`${c}\``).join(',');
    const kind = idx.unique ? 'UNIQUE INDEX' : 'INDEX';
    const where = idx.where !== undefined ? ` WHERE ${idx.where}` : '';
    return `CREATE ${kind} \`${idx.name}\` ON \`${tableName}\` (${columns})${where}`;
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
    const snap = descriptorToSnapshotTable(table, dialect);
    return [
        renderCreateTable(snap),
        ...snap.indexes.map((idx) => renderCreateIndex(snap.name, idx)),
    ];
}
