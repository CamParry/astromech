/**
 * DDL renderers — `Snapshot*` data → `CREATE TABLE` / `CREATE INDEX` SQL. Pure
 * (no fs/db imports). Both the direct emit path and the migration generator
 * (`diff.ts` + `render.ts`) funnel through these, so the two can't drift apart.
 */

import type {
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
} from './model';
import { capIdentifier } from './identifiers';

function quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Render a SQL-literal `DEFAULT`/`COALESCE` value (string/number/boolean). */
export function renderLiteral(value: string | number | boolean): string {
    if (typeof value === 'string') return quoteLiteral(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
}

/**
 * Render one column's clause: `` `name` type [PRIMARY KEY] [DEFAULT lit]
 * [NOT NULL] [CHECK …] ``. Shared by `renderCreateTable` and the migration
 * generator's `ADD COLUMN` rendering. `tableLevelPrimaryKey` suppresses the inline `PRIMARY KEY`.
 */
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
 * The name a foreign-key constraint is emitted under, capped. Postgres
 * auto-names an unnamed FK and truncates it silently at 63 bytes, so this
 * takes PG's auto-naming out of the identifier budget entirely.
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
 * Render a table's `CREATE TABLE` statement — columns, then a composite
 * `PRIMARY KEY` if declared, then table-level FKs. `constraintsFor` names the
 * table FK constraint names derive from, when it differs from the table created.
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
