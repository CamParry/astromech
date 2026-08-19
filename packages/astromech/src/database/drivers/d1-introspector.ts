import type {
    ColumnMetadata,
    DatabaseIntrospector,
    DatabaseMetadata,
    DatabaseMetadataOptions,
    Kysely,
    SchemaMetadata,
    TableMetadata,
} from 'kysely';
import { DEFAULT_MIGRATION_LOCK_TABLE, DEFAULT_MIGRATION_TABLE, sql } from 'kysely';

/**
 * Kysely introspector for Cloudflare D1.
 *
 * Kysely's `SqliteIntrospector` collects column metadata with a single query
 * that joins the table list against `pragma_table_info(tl.name)` — a pragma
 * table-valued function whose argument is a *column reference*. D1 runs behind
 * a SQLite authorizer that rejects exactly that form with `SQLITE_AUTH`; the
 * same function is allowed when its argument is a literal or a bound parameter.
 *
 * `Migrator` introspects before it creates its own bookkeeping table, so on D1
 * that one query fails every migration run. This issues one bound
 * `pragma_table_info(?)` per table instead, and reproduces the rest of
 * `SqliteIntrospector`'s output so both drivers report identical metadata.
 */

type MasterRow = { name: string; sql: string | null; type: string };

type ColumnRow = {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
};

export class D1Introspector implements DatabaseIntrospector {
    private readonly db: Kysely<unknown>;

    constructor(db: Kysely<unknown>) {
        this.db = db;
    }

    /** SQLite has no schemas. */
    async getSchemas(): Promise<SchemaMetadata[]> {
        return [];
    }

    async getTables(
        options: DatabaseMetadataOptions = { withInternalKyselyTables: false }
    ): Promise<TableMetadata[]> {
        const tables = await this.listTables(options);
        return Promise.all(tables.map((table) => this.describeTable(table)));
    }

    /** @deprecated Kysely keeps this on the interface; `getTables` is the real one. */
    async getMetadata(options?: DatabaseMetadataOptions): Promise<DatabaseMetadata> {
        return { tables: await this.getTables(options) };
    }

    /** Tables and views, minus SQLite's, D1's, and optionally Kysely's own. */
    private async listTables(options: DatabaseMetadataOptions): Promise<MasterRow[]> {
        const { rows } = await sql<MasterRow>`
            select name, sql, type from sqlite_master
            where type in ('table', 'view')
              and name not like 'sqlite\\_%' escape '\\'
              and name not like '\\_cf\\_%' escape '\\'
            order by name
        `.execute(this.db);

        if (options.withInternalKyselyTables) return [...rows];
        return rows.filter(
            (row) =>
                row.name !== DEFAULT_MIGRATION_TABLE &&
                row.name !== DEFAULT_MIGRATION_LOCK_TABLE
        );
    }

    /** One bound `pragma_table_info(?)` per table — the form D1 permits. */
    private async describeTable(table: MasterRow): Promise<TableMetadata> {
        const { rows } = await sql<ColumnRow>`
            select * from pragma_table_info(${table.name}) order by cid
        `.execute(this.db);

        const autoIncrementing = autoIncrementColumn(table.sql, rows);
        // `comment` is omitted rather than set to undefined: SQLite has no
        // column comments, and the project builds with exactOptionalPropertyTypes.
        const columns: ColumnMetadata[] = rows.map((column) => ({
            name: column.name,
            dataType: column.type,
            isNullable: !column.notnull,
            isAutoIncrementing: column.name === autoIncrementing,
            hasDefaultValue: column.dflt_value != null,
        }));

        return { name: table.name, isView: table.type === 'view', columns };
    }
}

/**
 * The autoincrementing column, if any: named by the `AUTOINCREMENT` keyword in
 * the table's DDL, or else a lone INTEGER primary key, which SQLite treats as
 * a rowid alias. Mirrors `SqliteIntrospector` so both drivers agree.
 */
function autoIncrementColumn(
    createSql: string | null,
    columns: readonly ColumnRow[]
): string | undefined {
    const declared = createSql
        ?.split(/[(),]/)
        .find((part) => part.toLowerCase().includes('autoincrement'))
        ?.trimStart()
        .split(/\s+/)[0]
        ?.replace(/["`]/g, '');
    if (declared) return declared;

    const primaryKeys = columns.filter((column) => column.pk > 0);
    const only = primaryKeys.length === 1 ? primaryKeys[0] : undefined;
    return only && only.type.toLowerCase() === 'integer' ? only.name : undefined;
}
