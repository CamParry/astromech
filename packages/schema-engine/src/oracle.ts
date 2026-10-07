import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { renderLiteral } from './ddl';

/**
 * Schema oracle — a normalized `sqlite_master` dump. The parity primitive: two
 * databases built by different routes are equivalent iff their `dumpSchema`
 * output matches, once comments, whitespace, identifier quoting and column order are
 * normalized.
 */

/** One row of a normalized `sqlite_master` dump — see {@link dumpSchema}. */
export type SchemaRow = {
    type: 'table' | 'index';
    name: string;
    tblName: string;
    sql: string;
};

type MasterRow = {
    type: string;
    name: string;
    tblName: string;
    sql: string | null;
};

/** A quoted name or string literal, each closing quote that is doubled inside
 *  it read as part of it. */
const QUOTED = /'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]/;
/** A run of whitespace and comments. */
const GAP = /(?:\s|--[^\n]*|\/\*[\s\S]*?\*\/)+/;
const QUOTED_AT = new RegExp(QUOTED.source, 'y');
const TOKEN = new RegExp(`(${QUOTED.source})|${GAP.source}`, 'g');

/** Where the quoted name or literal starting at `i` ends, or `i` itself when
 *  none starts there. */
function skipQuoted(text: string, i: number): number {
    QUOTED_AT.lastIndex = i;
    return QUOTED_AT.test(text) ? QUOTED_AT.lastIndex : i;
}

/**
 * `statement` with each run of whitespace and comments outside a quoted name or
 * literal made one space, and each `"ident"` written `` `ident` ``, the
 * quoting a RENAME leaves. Quoted names and literals are otherwise kept byte for
 * byte, so two that differ only in spacing stay different.
 */
function normalize(statement: string): string {
    return statement
        .replace(TOKEN, (_, quoted: string | undefined) => {
            if (quoted === undefined) return ' ';
            return /^"[A-Za-z_][A-Za-z0-9_]*"$/.test(quoted)
                ? `\`${quoted.slice(1, -1)}\``
                : quoted;
        })
        .trim();
}

/** A `CREATE TABLE` statement cut into the text before its definition list,
 *  each column or table constraint in the list, and the text after it. */
type TableDefinition = { head: string; definitions: string[]; tail: string };

/**
 * A normalized `statement` cut into a {@link TableDefinition}; `null` for any
 * other statement, such as a `CREATE VIRTUAL TABLE`, whose arguments keep their
 * order. SQLite stores every `CREATE TABLE` with its definition list, so the
 * scan always reaches the list's closing `)`.
 */
function splitCreateTable(statement: string): TableDefinition | null {
    if (!/^CREATE TABLE /i.test(statement)) return null;
    let depth = 0;
    let open = 0;
    const cuts: number[] = [];
    let i = 0;
    for (; i < statement.length; i++) {
        const end = skipQuoted(statement, i);
        if (end !== i) {
            i = end - 1;
            continue;
        }
        const char = statement[i];
        if (char === '(') {
            if (depth === 0) open = i;
            depth++;
        } else if (char === ')') {
            depth--;
            if (depth === 0) break;
        } else if (char === ',' && depth === 1) {
            cuts.push(i);
        }
    }
    const definitions: string[] = [];
    let start = open + 1;
    for (const cut of [...cuts, i]) {
        definitions.push(statement.slice(start, cut).trim());
        start = cut + 1;
    }
    return {
        head: statement.slice(0, open).trim(),
        definitions,
        tail: statement.slice(i + 1).trim(),
    };
}

/** A trimmed column definition's name, unquoted; `null` for a table
 *  constraint. */
function columnName(definition: string): string | null {
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(definition)) return null;
    const end = skipQuoted(definition, 0);
    if (end === 0) return definition.replace(/[\s(][\s\S]*$/, '');
    const quote = definition.charAt(end - 1);
    return definition
        .slice(1, end - 1)
        .split(quote + quote)
        .join(quote);
}

/**
 * A table's normalized `CREATE TABLE` text with its column definitions sorted by name,
 * table constraints after them in their own order, and one `, ` between each.
 * Column order is not part of the schema contract (`DECISIONS.md`): SQLite
 * appends a column that `ALTER TABLE ADD COLUMN` adds, with its own spacing,
 * where a fresh build places it in snapshot order.
 */
function canonicalTable(statement: string): string {
    const table = splitCreateTable(statement);
    if (table === null) return statement;
    const columns: { name: string; text: string }[] = [];
    const constraints: string[] = [];
    for (const definition of table.definitions) {
        const name = columnName(definition);
        if (name === null) constraints.push(definition);
        else columns.push({ name, text: definition });
    }
    // SQLite refuses two columns with the same name, so no two compare equal.
    columns.sort((a, b) => (a.name < b.name ? -1 : 1));
    const list = [...columns.map((c) => c.text), ...constraints].join(', ');
    return `${table.head} (${list})${table.tail === '' ? '' : ` ${table.tail}`}`;
}

/**
 * Normalized `sqlite_master` dump, ordered by (type, tblName, name). Each
 * table's columns are listed by name, not in their order on disk.
 * `opts.tables` filters to those `tbl_name`s; omitted = every non-internal table.
 */
export async function dumpSchema<T>(
    db: Kysely<T>,
    opts?: { tables?: string[] }
): Promise<SchemaRow[]> {
    const filter =
        opts?.tables !== undefined
            ? ` AND tbl_name IN (${opts.tables.map((name) => renderLiteral(name, 'a table name')).join(',')})`
            : '';
    const { rows } = await sql
        .raw<MasterRow>(
            `SELECT type, name, tbl_name AS tblName, sql FROM sqlite_master ` +
                `WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'${filter} ` +
                `ORDER BY type, tbl_name, name`
        )
        .execute(db);

    return rows
        .filter((row): row is MasterRow & { sql: string } => row.sql !== null)
        .map((row) => ({
            type: row.type as 'table' | 'index',
            name: row.name,
            tblName: row.tblName,
            sql:
                row.type === 'table'
                    ? canonicalTable(normalize(row.sql))
                    : normalize(row.sql),
        }));
}
