import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Schema oracle — a normalized `sqlite_master` dump. The parity primitive: two
 * databases built by different routes are equivalent iff their `dumpSchema`
 * output matches, once whitespace, identifier quoting and column order are
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

function quoteName(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Collapse whitespace and rewrite `"ident"` as `` `ident` ``. Restricted to
 * bare-identifier characters, so a double quote inside a `'…'` literal — the
 * only other place one can appear in DDL we emit — is left alone.
 */
function normalize(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`')
        .trim();
}

/** Where the quoted name, string literal or comment starting at `i` ends, or
 *  `i` itself when none starts there. */
function skipQuoted(text: string, i: number): number {
    const char = text[i] ?? '';
    const span = (open: number, close: string): number => {
        const end = text.indexOf(close, i + open);
        return end === -1 ? text.length : end + close.length;
    };
    // A doubled quote inside a span reads as two spans back to back, which
    // ends in the same place.
    if (char === '[') return span(1, ']');
    if (char === "'" || char === '"' || char === '`') return span(1, char);
    if (text.startsWith('--', i)) return span(2, '\n');
    if (text.startsWith('/*', i)) return span(2, '*/');
    return i;
}

/** A `CREATE TABLE` statement cut into the text before its definition list,
 *  each column or table constraint in the list, and the text after it. */
type TableDefinition = { head: string; definitions: string[]; tail: string };

function splitCreateTable(statement: string): TableDefinition | null {
    if (!/^CREATE TABLE /i.test(statement)) return null;
    let depth = 0;
    let open = -1;
    const cuts: number[] = [];
    for (let i = 0; i < statement.length; i++) {
        const end = skipQuoted(statement, i);
        if (end !== i) {
            i = end - 1;
            continue;
        }
        const char = statement[i];
        if (char === '(') {
            if (open === -1) open = i;
            depth++;
        } else if (char === ')') {
            depth--;
            if (depth === 0) {
                const bounds = [open, ...cuts, i];
                return {
                    head: statement.slice(0, open),
                    definitions: bounds
                        .slice(1)
                        .map((cut, n) => statement.slice((bounds[n] ?? 0) + 1, cut)),
                    tail: statement.slice(i + 1),
                };
            }
        } else if (char === ',' && depth === 1) {
            cuts.push(i);
        }
    }
    return null;
}

/** A column definition's name, unquoted; `null` for a table constraint. */
function columnName(definition: string): string | null {
    const text = definition.trim();
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(text)) return null;
    const end = skipQuoted(text, 0);
    if (end === 0) return /^[^\s(]*/.exec(text)?.[0] ?? text;
    const quote = text[end - 1] ?? '';
    return text
        .slice(1, end - 1)
        .split(quote + quote)
        .join(quote);
}

/**
 * A table's `CREATE TABLE` text with its column definitions sorted by name,
 * table constraints after them in their own order, and one `, ` between each.
 * Column order is not part of the schema contract (`DECISIONS.md`): SQLite
 * appends a column that `ALTER TABLE ADD COLUMN` adds, with its own spacing,
 * where a fresh build places it in snapshot order.
 */
function canonicalTable(statement: string): string {
    const table = splitCreateTable(statement);
    if (table === null) return normalize(statement);
    const columns: { name: string; text: string }[] = [];
    const constraints: string[] = [];
    for (const definition of table.definitions) {
        const name = columnName(definition);
        if (name === null) constraints.push(normalize(definition));
        else columns.push({ name, text: normalize(definition) });
    }
    columns.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const list = [...columns.map((c) => c.text), ...constraints].join(', ');
    const tail = normalize(table.tail);
    return `${normalize(table.head)} (${list})${tail === '' ? '' : ` ${tail}`}`;
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
            ? ` AND tbl_name IN (${opts.tables.map(quoteName).join(',')})`
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
            sql: row.type === 'table' ? canonicalTable(row.sql) : normalize(row.sql),
        }));
}
