/**
 * DDL emitter — `TableDescriptor` → `CREATE TABLE` / `CREATE INDEX` SQL.
 *
 * Pure, browser-safe (no db imports). Renders one descriptor's DDL in the same
 * style as the hand-authored baseline (`apps/demo/drizzle/baseline.ts`):
 * backtick-quoted identifiers, 4-space-indented multi-line `CREATE TABLE`, one
 * column per line, table-level `FOREIGN KEY` clauses. Column-level
 * `unique: true` synthesizes a `CREATE UNIQUE INDEX` (never an inline SQL
 * `UNIQUE`) so a column-unique and an explicit named index never diverge in
 * shape. Step 4's migration generator diffs `snapshot.ts` output and reuses
 * this module as its single source of `CREATE`-statement rendering, so both
 * paths never drift apart.
 *
 * Every function takes/keys off a `SqlDialect` tag rather than inspecting a
 * driver — the seam a Postgres emitter slots into later.
 */

import type {
    ColumnKind,
    ColumnRuntime,
    IndexSpec,
    ReferenceTarget,
    TableDescriptor,
} from '@/database/define-table.js';

export type SqlDialect = 'sqlite';

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

function renderDefault(value: string | number | boolean): string {
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

function renderColumn(key: string, col: ColumnRuntime, dialect: SqlDialect): string {
    const name = toSnakeCase(key);
    const parts = [`\`${name}\``, columnType(col.kind, dialect)];
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (col.sqlDefault !== undefined)
        parts.push(`DEFAULT ${renderDefault(col.sqlDefault)}`);
    if (col.notNull) parts.push('NOT NULL');
    if (col.kind === 'enum' && col.enumValues !== undefined) {
        const values = col.enumValues.map(quoteLiteral).join(', ');
        parts.push(`CHECK (\`${name}\` IN (${values}))`);
    }
    return parts.join(' ');
}

function renderForeignKey(key: string, col: ColumnRuntime): string {
    const ref = col.reference;
    if (!ref) {
        throw new Error(`[Astromech] column "${key}" has no reference to render`);
    }
    const { table, column } = resolveReferenceTarget(ref.target());
    const name = toSnakeCase(key);
    return (
        `FOREIGN KEY (\`${name}\`) REFERENCES \`${table}\`(\`${column}\`) ` +
        `ON UPDATE no action ON DELETE ${ref.onDelete}`
    );
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

function renderIndex(tableName: string, idx: IndexSpec): string {
    const columns = idx.columns.map((c) => `\`${toSnakeCase(c)}\``).join(',');
    const kind = idx.unique ? 'UNIQUE INDEX' : 'INDEX';
    const where = idx.where !== undefined ? ` WHERE ${idx.where}` : '';
    return `CREATE ${kind} \`${idx.name}\` ON \`${tableName}\` (${columns})${where}`;
}

/** Render a table's `CREATE TABLE` statement (columns, then table-level FKs,
 *  in column declaration order). */
export function emitCreateTable(table: TableDescriptor, dialect: SqlDialect): string {
    const cols = Object.entries(table.columns);
    const columnLines = cols.map(([key, col]) => renderColumn(key, col, dialect));
    const fkLines = cols
        .filter(([, col]) => col.reference)
        .map(([key, col]) => renderForeignKey(key, col));
    const lines = [...columnLines, ...fkLines].map((line) => `    ${line}`);
    return `CREATE TABLE \`${table.name}\` (\n${lines.join(',\n')}\n)`;
}

/** Render a table's index statements — explicit indexes then synthesized
 *  column-unique indexes. */
export function emitCreateIndexes(table: TableDescriptor, dialect: SqlDialect): string[] {
    void dialect;
    return allIndexes(table).map((idx) => renderIndex(table.name, idx));
}

/** Render a table's full statement set: `CREATE TABLE` first, then indexes. */
export function emitTableStatements(
    table: TableDescriptor,
    dialect: SqlDialect
): string[] {
    return [emitCreateTable(table, dialect), ...emitCreateIndexes(table, dialect)];
}
