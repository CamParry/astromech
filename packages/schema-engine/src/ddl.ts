/**
 * DDL renderers — `Snapshot*` data → `CREATE TABLE` / `CREATE INDEX` SQL.
 *
 * Pure (no fs/db imports). Backtick-quoted identifiers, 4-space-indented
 * multi-line `CREATE TABLE`, one column per line, table-level `FOREIGN KEY`
 * clauses. There is no inline column `UNIQUE`: a unique constraint is always a
 * `CREATE UNIQUE INDEX`, so a caller's column-level unique and an explicitly
 * named unique index can never diverge in shape.
 *
 * These are the single source of DDL rendering: both the direct emit path
 * (render a table as it should exist) and the migration generator (`diff.ts` +
 * `render.ts`) funnel through the same functions, so the two can never
 * silently drift apart.
 */

import { capIdentifier } from './identifiers.js';
import type {
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
} from './model.js';

function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Render a SQL-literal `DEFAULT`/`COALESCE` value (string/number/boolean). */
export function renderLiteral(value: string | number | boolean): string {
    if (typeof value === 'string') return quoteLiteral(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
}

/** Render one column's clause: `` `name` type [PRIMARY KEY] [DEFAULT lit]
 *  [NOT NULL] [CHECK …] ``. Shared by `renderCreateTable` and the migration
 *  generator's `ADD COLUMN` rendering (`render.ts`). `tableLevelPrimaryKey`
 *  suppresses the inline `PRIMARY KEY`, which SQLite rejects alongside a
 *  table-level one. */
export function renderColumnClause(
    col: SnapshotColumn,
    opts: { tableLevelPrimaryKey?: boolean } = {}
): string {
    const parts = [`\`${col.name}\``, col.type];
    if (col.primaryKey && !opts.tableLevelPrimaryKey) parts.push('PRIMARY KEY');
    if (col.default !== undefined) parts.push(`DEFAULT ${renderLiteral(col.default)}`);
    if (col.notNull) parts.push('NOT NULL');
    if (col.enumValues !== undefined) {
        const values = col.enumValues.map(quoteLiteral).join(', ');
        parts.push(`CHECK (\`${col.name}\` IN (${values}))`);
    }
    return parts.join(' ');
}

/**
 * The name a foreign-key constraint is emitted under. Postgres auto-names an
 * unnamed FK `<table>_<column>_fkey` and truncates that silently at 63 bytes,
 * so we emit the name ourselves — capped, which takes PG's auto-naming out of
 * the identifier budget entirely.
 */
export function foreignKeyName(tableName: string, column: string): string {
    return capIdentifier(`${tableName}_${column}_fkey`);
}

function renderForeignKeyClause(tableName: string, fk: SnapshotForeignKey): string {
    return (
        `CONSTRAINT \`${foreignKeyName(tableName, fk.column)}\` ` +
        `FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.targetTable}\`(\`${fk.targetColumn}\`) ` +
        `ON UPDATE no action ON DELETE ${fk.onDelete}`
    );
}

/**
 * Render a table's `CREATE TABLE` statement — columns, then a table-level
 * `PRIMARY KEY` if the table declares a composite one, then table-level FKs,
 * in column declaration order.
 *
 * `constraintsFor` names the table the FK constraint names should be derived
 * from, when that differs from the table being created. Only the rebuild path
 * needs it: it creates `__new_x` and renames it to `x`, and constraint names
 * survive the rename — so they must read `x_<col>_fkey` from the start or a
 * rebuilt table's DDL diverges permanently from a freshly emitted one.
 */
export function renderCreateTable(
    table: SnapshotTable,
    constraintsFor: string = table.name
): string {
    const tableLevelPrimaryKey = table.primaryKey !== undefined;
    const columnLines = table.columns.map((col) =>
        renderColumnClause(col, { tableLevelPrimaryKey })
    );
    const pkLines =
        table.primaryKey !== undefined
            ? [`PRIMARY KEY (${table.primaryKey.map((c) => `\`${c}\``).join(', ')})`]
            : [];
    const fkLines = table.fks.map((fk) => renderForeignKeyClause(constraintsFor, fk));
    const lines = [...columnLines, ...pkLines, ...fkLines].map((line) => `    ${line}`);
    return `CREATE TABLE \`${table.name}\` (\n${lines.join(',\n')}\n)`;
}

/** Render one `CREATE [UNIQUE] INDEX` statement. */
export function renderCreateIndex(tableName: string, idx: SnapshotIndex): string {
    const columns = idx.columns.map((c) => `\`${c}\``).join(',');
    const kind = idx.unique ? 'UNIQUE INDEX' : 'INDEX';
    const where = idx.where !== undefined ? ` WHERE ${idx.where}` : '';
    return `CREATE ${kind} \`${idx.name}\` ON \`${tableName}\` (${columns})${where}`;
}

/** Render a table's full statement set: `CREATE TABLE` first, then its indexes. */
export function renderTableStatements(table: SnapshotTable): string[] {
    return [
        renderCreateTable(table),
        ...table.indexes.map((idx) => renderCreateIndex(table.name, idx)),
    ];
}
