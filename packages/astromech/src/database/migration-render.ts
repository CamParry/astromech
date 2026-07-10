/**
 * Migration statement/file renderer — `TableOp[]` (from `diff.ts`) → SQL
 * statements → a complete generated migration module's TS source.
 *
 * Pure, browser-safe (no fs imports) — `generator.ts` is the Node-only
 * orchestrator that writes the rendered source to disk. Statement rendering
 * for `createTable`/`dropTable`/`addColumn`/`dropIndex`/`createIndex` reuses
 * `ddl.ts`'s `renderCreateTable`/`renderCreateIndex`/`renderColumnClause` so
 * the generator and the descriptor-emit path never diverge in SQL shape.
 *
 * `rebuildTable` is the one op with no native SQLite equivalent — SQLite has
 * no `ALTER COLUMN`/`DROP COLUMN` that survives CHECK/index constraints, so a
 * changed table is rebuilt wholesale (`specs/data-layer.md` §"Step 4"):
 * `PRAGMA defer_foreign_keys = true` → `CREATE __new_x` → `INSERT…SELECT`
 * (COALESCE-backfilling any nullable→NOT NULL column) → `DROP x` →
 * `RENAME __new_x TO x` → recreate every index. No self-managed
 * `BEGIN`/`COMMIT` — Kysely's `Migrator` already wraps each migration in a
 * transaction, and `defer_foreign_keys` is tx-scoped (auto-resets on commit).
 *
 * The rendered module has no `down()` — migrations are forward-only (a
 * descriptor is *state*, not history; reverting is a fresh forward migration).
 */

import {
    renderColumnClause,
    renderCreateIndex,
    renderCreateTable,
    renderLiteral,
    type SqlDialect,
} from '@/database/ddl.js';
import type { TableOp } from '@/database/diff.js';

/** Render one op's SQL statement(s), in apply order. */
export function renderOpStatements(op: TableOp, dialect: SqlDialect): string[] {
    // Dialect only branches inside ddl.ts's renderers today (sqlite is the
    // only dialect); kept as a parameter for the seam a Postgres generator
    // slots into later.
    void dialect;

    switch (op.kind) {
        case 'createTable':
            return [
                renderCreateTable(op.table),
                ...op.table.indexes.map((idx) => renderCreateIndex(op.table.name, idx)),
            ];
        case 'dropTable':
            return [`DROP TABLE \`${op.name}\``];
        case 'dropIndex':
            return [`DROP INDEX \`${op.name}\``];
        case 'createIndex':
            return [renderCreateIndex(op.table, op.index)];
        case 'addColumn':
            return [
                `ALTER TABLE \`${op.table}\` ADD COLUMN ${renderColumnClause(op.column)}`,
            ];
        case 'rebuildTable': {
            const tmpName = `__new_${op.table.name}`;
            const statements: string[] = [
                'PRAGMA defer_foreign_keys = true',
                renderCreateTable({ ...op.table, name: tmpName }),
            ];
            if (op.copy.length > 0) {
                const columns = op.copy.map((c) => `\`${c.column}\``).join(', ');
                const selects = op.copy
                    .map((c) =>
                        c.coalesceDefault !== undefined
                            ? `COALESCE(\`${c.column}\`, ${renderLiteral(c.coalesceDefault)})`
                            : `\`${c.column}\``
                    )
                    .join(', ');
                statements.push(
                    `INSERT INTO \`${tmpName}\` (${columns}) SELECT ${selects} FROM \`${op.table.name}\``
                );
            }
            statements.push(`DROP TABLE \`${op.table.name}\``);
            statements.push(`ALTER TABLE \`${tmpName}\` RENAME TO \`${op.table.name}\``);
            for (const idx of op.table.indexes) {
                statements.push(renderCreateIndex(op.table.name, idx));
            }
            return statements;
        }
    }
}

/** Escape backticks / `${` so a raw SQL statement embeds safely inside a
 *  `` sql`…` `` template literal in the generated module. */
function escapeForTemplateLiteral(statement: string): string {
    return statement.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Indent one statement as `await sql\`…\`.execute(db);` in the generated
 *  module's `up()` body — single-line statements inline on one line,
 *  multi-line `CREATE TABLE` statements indented like the baseline. */
function renderStatementLine(statement: string): string {
    const escaped = escapeForTemplateLiteral(statement);
    if (!escaped.includes('\n')) {
        return `    await sql\`${escaped}\`.execute(db);`;
    }
    const indented = escaped
        .split('\n')
        .map((line) => `        ${line}`)
        .join('\n');
    return `    await sql\`\n${indented}\n    \`.execute(db);`;
}

/** Render a complete generated migration module — every op's statements, in
 *  order, as one `up(db)` function. No `down()` (forward-only). */
export function renderMigrationFile(ops: TableOp[], dialect: SqlDialect): string {
    const statements = ops.flatMap((op) => renderOpStatements(op, dialect));
    const body =
        statements.length > 0
            ? statements.map(renderStatementLine).join('\n')
            : '    // no-op';
    return [
        "import { sql, type Kysely } from 'kysely';",
        '',
        'export async function up(db: Kysely<unknown>): Promise<void> {',
        body,
        '}',
        '',
    ].join('\n');
}
