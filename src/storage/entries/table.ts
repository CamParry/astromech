/**
 * tableStorage — EntryStorage implementation over an arbitrary drizzle SQLite table.
 *
 * Maps any SQLiteTable to the EntryStorage contract by treating every column
 * that is not the id/timestamp/actor-reserved set as a "field". Declares no
 * capabilities (supports: []) — statuses, slug, trash, versioning, and
 * translatable must all be disabled for any entry type using this storage.
 *
 * When `timestamps: false`, createdAt/updatedAt return new Date(0) and are not
 * written. createdBy/updatedBy are written only when those columns are present
 * on the table.
 *
 * search + searchFields: OR-LIKE across the named columns. If searchFields names
 * a column not on the table, throws at list-time (config bug — crash loud).
 * If search is set but no searchFields, search is a no-op.
 *
 * where filters: keyed by COLUMN names. Supports eq, in (via { in: [...] }),
 * and like (via { like: '%...' }) operators — mirrors what built-in exposes.
 *
 * sort: field names must match column names (id, createdAt, updatedAt, or any
 * field column).
 *
 * uniqueSlug: not supported — throws with an instructional error.
 * transaction: wraps fn in a drizzle tx, rebinding a new tableStorage instance.
 */

import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDb } from '@/db/registry.js';
import type { JsonObject } from '@/types/index.js';
import type {
    EntryRecord,
    EntryStorage,
    EntryWrite,
    ListParams,
    StorageDb,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumn = any;

export type TableStorageOptions = {
    /** Primary key column name. Default 'id'. */
    idColumn?: string;
    /**
     * Managed timestamp column names; pass false to disable.
     * Default { createdAt: 'createdAt', updatedAt: 'updatedAt' }.
     * When false, createdAt/updatedAt return new Date(0) and are not written.
     */
    timestamps?: { createdAt?: string; updatedAt?: string } | false;
};

class TableStorage implements EntryStorage<EntryRecord> {
    public readonly supports: readonly never[] = Object.freeze([]) as readonly never[];

    private readonly table: SQLiteTable;
    private readonly idCol: string;
    private readonly createdAtCol: string | false;
    private readonly updatedAtCol: string | false;
    private readonly dbOverride: Db | undefined;

    constructor(table: SQLiteTable, options?: TableStorageOptions, dbOverride?: Db) {
        this.table = table;
        this.idCol = options?.idColumn ?? 'id';

        if (options?.timestamps === false) {
            this.createdAtCol = false;
            this.updatedAtCol = false;
        } else {
            this.createdAtCol = options?.timestamps?.createdAt ?? 'createdAt';
            this.updatedAtCol = options?.timestamps?.updatedAt ?? 'updatedAt';
        }

        this.dbOverride = dbOverride;
    }

    private get db(): Db {
        return this.dbOverride ?? getDb();
    }

    private getColumns(): Record<string, AnyColumn> {
        return getTableColumns(this.table) as Record<string, AnyColumn>;
    }

    /** Reserved column names — never treated as fields. */
    private reservedNames(): Set<string> {
        const cols = this.getColumns();
        const reserved = new Set<string>([this.idCol]);
        if (this.createdAtCol !== false) reserved.add(this.createdAtCol);
        if (this.updatedAtCol !== false) reserved.add(this.updatedAtCol);
        if ('createdBy' in cols) reserved.add('createdBy');
        if ('updatedBy' in cols) reserved.add('updatedBy');
        return reserved;
    }

    /** Column object by logical name; throws if not found. */
    private col(name: string): AnyColumn {
        const cols = this.getColumns();
        const col = cols[name];
        if (!col) throw new Error(`tableStorage: column "${name}" not found on table`);
        return col;
    }

    /** Build an EntryRecord from a raw row. */
    private rowToRecord(row: Record<string, unknown>): EntryRecord {
        const reserved = this.reservedNames();
        const cols = this.getColumns();
        const fields: Record<string, unknown> = {};

        for (const [key] of Object.entries(cols)) {
            if (reserved.has(key)) continue;
            fields[key] = row[key] ?? null;
        }

        const idVal = row[this.idCol];
        const id = typeof idVal === 'string' ? idVal : String(idVal);

        let createdAt: Date;
        let updatedAt: Date;

        if (this.createdAtCol === false) {
            createdAt = new Date(0);
        } else {
            const raw = row[this.createdAtCol];
            createdAt = raw instanceof Date ? raw : new Date((raw as number) * 1000);
        }

        if (this.updatedAtCol === false) {
            updatedAt = new Date(0);
        } else {
            const raw = row[this.updatedAtCol];
            updatedAt = raw instanceof Date ? raw : new Date((raw as number) * 1000);
        }

        const record: EntryRecord = {
            id,
            fields: fields as JsonObject,
            createdAt,
            updatedAt,
        };

        const colKeys = Object.keys(cols);
        if (colKeys.includes('createdBy')) {
            record.createdBy = (row['createdBy'] as string | null | undefined) ?? null;
        }
        if (colKeys.includes('updatedBy')) {
            record.updatedBy = (row['updatedBy'] as string | null | undefined) ?? null;
        }

        return record;
    }

    async transaction<T>(
        fn: (storage: EntryStorage<EntryRecord>, db: StorageDb) => Promise<T>
    ): Promise<T> {
        return this.db.transaction(async (tx) => {
            const txDb = tx as unknown as Db;
            let timestamps: TableStorageOptions['timestamps'];
            if (this.createdAtCol === false) {
                timestamps = false;
            } else if (this.updatedAtCol === false) {
                timestamps = { createdAt: this.createdAtCol };
            } else {
                timestamps = {
                    createdAt: this.createdAtCol,
                    updatedAt: this.updatedAtCol,
                };
            }
            const txStorage = new TableStorage(
                this.table,
                { idColumn: this.idCol, timestamps },
                txDb
            );
            return fn(txStorage, txDb);
        });
    }

    uniqueSlug(): Promise<string> {
        throw new Error(
            'tableStorage does not support slugs; disable the slug capability for this entry type'
        );
    }

    async create(data: EntryWrite & { type: string }): Promise<EntryRecord> {
        const db = this.db;
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();
        const id = crypto.randomUUID();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertValues: Record<string, any> = {};
        insertValues[this.idCol] = id;

        if (this.createdAtCol !== false) insertValues[this.createdAtCol] = now;
        if (this.updatedAtCol !== false) insertValues[this.updatedAtCol] = now;

        if ('createdBy' in cols && data.createdBy !== undefined)
            insertValues['createdBy'] = data.createdBy;
        if ('updatedBy' in cols && data.updatedBy !== undefined)
            insertValues['updatedBy'] = data.updatedBy;

        const fields = data.fields ?? {};
        for (const [key, value] of Object.entries(fields)) {
            if (!reserved.has(key) && key in cols) {
                insertValues[key] = value;
            }
        }

        const rows = await db.insert(this.table).values(insertValues).returning();

        const row = rows[0];
        if (!row) throw new Error('tableStorage: insert returned no row');
        return this.rowToRecord(row as Record<string, unknown>);
    }

    async update(id: string, data: EntryWrite): Promise<EntryRecord> {
        const db = this.db;
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setValues: Record<string, any> = {};

        if (this.updatedAtCol !== false) setValues[this.updatedAtCol] = now;

        if ('updatedBy' in cols && data.updatedBy !== undefined)
            setValues['updatedBy'] = data.updatedBy;

        const fields = data.fields ?? {};
        for (const [key, value] of Object.entries(fields)) {
            if (!reserved.has(key) && key in cols) {
                setValues[key] = value;
            }
        }

        const rows = await db
            .update(this.table)
            .set(setValues)
            .where(eq(this.col(this.idCol), id))
            .returning();

        const row = rows[0];
        if (!row) throw new Error(`tableStorage: no row found for id "${id}"`);
        return this.rowToRecord(row as Record<string, unknown>);
    }

    async get(id: string): Promise<EntryRecord | null> {
        const db = this.db;
        const rows = await db
            .select()
            .from(this.table)
            .where(eq(this.col(this.idCol), id))
            .limit(1);

        const row = rows[0];
        if (!row) return null;
        return this.rowToRecord(row as Record<string, unknown>);
    }

    async delete(id: string): Promise<void> {
        const db = this.db;
        await db.delete(this.table).where(eq(this.col(this.idCol), id));
    }

    async list(params: ListParams): Promise<{ data: EntryRecord[]; total: number }> {
        const db = this.db;
        const conditions: AnyColumn[] = [];

        // search + searchFields
        if (params.search && params.searchFields && params.searchFields.length > 0) {
            const term = `%${params.search}%`;
            const orClauses = params.searchFields.map((fieldName) => {
                const col = this.col(fieldName); // throws if missing — config bug
                return like(col, term);
            });
            if (orClauses.length === 1) {
                conditions.push(orClauses[0]);
            } else {
                conditions.push(
                    or(...(orClauses as [AnyColumn, AnyColumn, ...AnyColumn[]]))
                );
            }
        }
        // If search is set but no searchFields, it's a no-op (documented).

        // where filters — keyed by column name
        if (params.where) {
            for (const [key, value] of Object.entries(params.where)) {
                if (value === undefined || value === null) continue;
                if (key === 'locale') continue; // no locale concept

                const col = this.col(key);

                if (typeof value === 'object' && !Array.isArray(value)) {
                    const v = value as Record<string, unknown>;
                    if ('in' in v && Array.isArray(v['in'])) {
                        conditions.push(inArray(col, v['in'] as unknown[]));
                    } else if ('like' in v && typeof v['like'] === 'string') {
                        conditions.push(like(col, v['like']));
                    } else {
                        conditions.push(eq(col, value));
                    }
                } else if (Array.isArray(value)) {
                    conditions.push(inArray(col, value as unknown[]));
                } else {
                    conditions.push(eq(col, value));
                }
            }
        }

        const whereClause =
            conditions.length > 0
                ? and(...(conditions as [AnyColumn, ...AnyColumn[]]))
                : undefined;

        // sort
        const orderClauses: AnyColumn[] = [];
        if (params.sort) {
            const sorts = Array.isArray(params.sort) ? params.sort : [params.sort];
            for (const s of sorts) {
                for (const [field, dir] of Object.entries(s)) {
                    const colObj = this.getColumns()[field];
                    if (!colObj) continue;
                    orderClauses.push(dir === 'asc' ? asc(colObj) : desc(colObj));
                }
            }
        }

        if (orderClauses.length === 0 && this.createdAtCol !== false) {
            const createdAtColObj = this.getColumns()[this.createdAtCol];
            if (createdAtColObj) orderClauses.push(desc(createdAtColObj));
        }

        const limit = params.limit;
        const page = params.page ?? 1;

        if (limit === 'all') {
            const query = db.select().from(this.table);
            if (whereClause) query.where(whereClause);
            if (orderClauses.length > 0)
                query.orderBy(...(orderClauses as [AnyColumn, ...AnyColumn[]]));
            const rows = await query;
            const data = (rows as Record<string, unknown>[]).map((r) =>
                this.rowToRecord(r)
            );
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const countQuery = db.select({ count: count() }).from(this.table);
        if (whereClause) countQuery.where(whereClause);
        const [countResult] = await countQuery;
        const total = countResult?.count ?? 0;

        const rowsQuery = db.select().from(this.table);
        if (whereClause) rowsQuery.where(whereClause);
        if (orderClauses.length > 0)
            rowsQuery.orderBy(...(orderClauses as [AnyColumn, ...AnyColumn[]]));
        rowsQuery.limit(perPage).offset(offset);
        const rows = await rowsQuery;

        const data = (rows as Record<string, unknown>[]).map((r) => this.rowToRecord(r));
        return { data, total };
    }
}

/**
 * Create an EntryStorage backed by an arbitrary drizzle SQLite table.
 *
 * Every column that is not the id/timestamp/actor-reserved set is treated as a
 * field; `EntryRecord.fields` is `{ [colName]: value }` for all such columns.
 * Capabilities are all off (supports: []); the entry type config must disable
 * statuses, slug, trash, translatable, and versioning.
 */
export function tableStorage(
    table: SQLiteTable,
    options?: TableStorageOptions
): EntryStorage {
    return new TableStorage(table, options) as EntryStorage;
}

// Re-export sql tagged template for tests that need raw DDL
export { sql };
