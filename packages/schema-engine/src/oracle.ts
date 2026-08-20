import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Schema oracle — a normalized `sqlite_master` dump. The parity primitive: two
 * databases built by different routes are equivalent iff their `dumpSchema`
 * output matches, once whitespace and identifier quoting are normalized.
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

/**
 * Whitespace-normalized `sqlite_master` dump, ordered by (type, tblName, name).
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
            sql: normalize(row.sql),
        }));
}
