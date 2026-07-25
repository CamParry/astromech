/**
 * Schema oracle — a normalized `sqlite_master` dump.
 *
 * The parity primitive: two databases built by different routes (an applied
 * migration chain vs. a direct `renderTableStatements` emit) are equivalent iff
 * their `dumpSchema` output matches. Whitespace inside each stored `sql` is
 * collapsed so formatting differences never register as drift.
 *
 * Auto-created internal rows are excluded — anything named `sqlite_*`, plus the
 * NULL-`sql` rows SQLite records for implicit indexes.
 */

import { sql, type Kysely } from 'kysely';

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

function normalize(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
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
