/**
 * tableStorage — EntryStorage implementation over an arbitrary `defineTable`
 * descriptor, queried through the shared Kysely handle.
 *
 * Maps any descriptor to the EntryStorage contract by treating every column
 * that is not the id/timestamp/actor-reserved set as a "field". Declares no
 * capabilities (supports: []) — statuses, slug, trash, versioning, and
 * translatable must all be disabled for any entry type using this storage.
 *
 * Column keys are the descriptor's camelCase keys throughout: `fields`, `where`,
 * `sort` and `searchFields` are all keyed by them. Rows are decoded/encoded with
 * the descriptor's own per-column codec (`decodeWith`/`encodeWith`/
 * `encodePatchWith`), so callers hand over and receive *domain* values (Date,
 * boolean, parsed json) while SQL only ever sees *storage* values.
 *
 * When `timestamps: false`, createdAt/updatedAt return new Date(0) and are not
 * written. createdBy/updatedBy are written only when those columns are present
 * on the descriptor.
 *
 * search + searchFields: OR-LIKE across the named columns. If searchFields names
 * a column not on the table, throws at list-time (config bug — crash loud).
 * If search is set but no searchFields, search is a no-op.
 *
 * where filters: keyed by COLUMN names. Supports eq, in (via { in: [...] }),
 * and like (via { like: '%...' }) operators — mirrors what built-in exposes.
 * Every comparison value (including each element of an `in` array) is run
 * through the column's `serialize`; a `like` pattern is passed through raw.
 *
 * sort: field names must match column names (id, createdAt, updatedAt, or any
 * field column); unknown names are skipped silently.
 *
 * uniqueSlug: not supported — throws with an instructional error.
 * transaction: wraps fn in a Kysely tx, rebinding a new tableStorage instance.
 */

import type { Expression, ExpressionBuilder, Kysely, SqlBool } from 'kysely';
import { getDb } from '@/database/registry.js';
import { supportsTransactions } from '@/database/capabilities.js';
import {
    decodeWith,
    encodePatchWith,
    encodeWith,
    kyselyTableKey,
} from '@/database/codec.js';
import type { Column, TableDescriptor } from '@/database/define-table.js';
import type { JsonObject } from '@/types/index.js';
import type {
    EntryRecord,
    EntryStorage,
    EntryWrite,
    ListParams,
    StorageDb,
} from './types.js';

/**
 * The descriptor's table may be any shape, so tableStorage queries through a
 * fully generic `DB` interface rather than the typed core one. Values crossing
 * the boundary are encoded/decoded by the descriptor codec, not by Kysely.
 */
type Schema = Record<string, Record<string, unknown>>;
type GenericDb = Kysely<Schema>;
type WhereFn = (eb: ExpressionBuilder<Schema, string>) => Expression<SqlBool>;
type OrderPair = [column: string, direction: 'asc' | 'desc'];

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

    private readonly table: TableDescriptor;
    private readonly tableKey: string;
    private readonly idCol: string;
    private readonly createdAtCol: string | false;
    private readonly updatedAtCol: string | false;
    private readonly dbOverride: GenericDb | undefined;

    constructor(
        table: TableDescriptor,
        options?: TableStorageOptions,
        dbOverride?: GenericDb
    ) {
        this.table = table;
        this.tableKey = kyselyTableKey(table.name);
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

    private get db(): GenericDb {
        return this.dbOverride ?? (getDb() as unknown as GenericDb);
    }

    private getColumns(): Record<string, Column> {
        return this.table.columns;
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

    /** Column descriptor by key; throws if not found. */
    private col(name: string): Column {
        const col = this.getColumns()[name];
        if (!col) throw new Error(`tableStorage: column "${name}" not found on table`);
        return col;
    }

    /**
     * Domain → storage for a comparison value. `where` arrives with domain
     * values (a boolean for an INTEGER 0/1 column, a Date for a timestamp), so
     * every literal that reaches SQL must go through the column's serializer —
     * drizzle did this implicitly via column mode.
     */
    private serialize(col: Column, value: unknown): unknown {
        if (value === null || value === undefined) return value;
        return col.serialize(value);
    }

    /** Build an EntryRecord from a raw (storage-shaped) row. */
    private rowToRecord(raw: Record<string, unknown>): EntryRecord {
        const row = decodeWith(this.table, raw);
        const reserved = this.reservedNames();
        const cols = this.getColumns();
        const fields: Record<string, unknown> = {};

        for (const key of Object.keys(cols)) {
            if (reserved.has(key)) continue;
            fields[key] = row[key] ?? null;
        }

        const idVal = row[this.idCol];
        const id = typeof idVal === 'string' ? idVal : String(idVal);

        const record: EntryRecord = {
            id,
            fields: fields as JsonObject,
            createdAt: this.timestampOf(row, this.createdAtCol),
            updatedAt: this.timestampOf(row, this.updatedAtCol),
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

    /** Disabled timestamps report the epoch; otherwise the decoded Date. */
    private timestampOf(row: Record<string, unknown>, column: string | false): Date {
        if (column === false) return new Date(0);
        const value = row[column];
        return value instanceof Date ? value : new Date(value as string | number);
    }

    async transaction<T>(
        fn: (storage: EntryStorage<EntryRecord>, db: StorageDb) => Promise<T>
    ): Promise<T> {
        return this.db.transaction().execute(async (trx) => {
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
                trx
            );
            return fn(txStorage, trx as unknown as StorageDb);
        });
    }

    uniqueSlug(): Promise<string> {
        throw new Error(
            'tableStorage does not support slugs; disable the slug capability for this entry type'
        );
    }

    async create(data: EntryWrite & { type: string }): Promise<EntryRecord> {
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();

        // The id is NOT minted here — `encodeWith` fills any column carrying an
        // app default (col.id() → ULID, col.timestamp({ defaultNow }) → now).
        const insertValues: Record<string, unknown> = {};

        if (this.createdAtCol !== false && this.createdAtCol in cols)
            insertValues[this.createdAtCol] = now;
        if (this.updatedAtCol !== false && this.updatedAtCol in cols)
            insertValues[this.updatedAtCol] = now;

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

        const row = await this.db
            .insertInto(this.tableKey)
            .values(encodeWith(this.table, insertValues))
            .returningAll()
            .executeTakeFirst();

        if (!row) throw new Error('tableStorage: insert returned no row');
        return this.rowToRecord(row);
    }

    async update(id: string, data: EntryWrite): Promise<EntryRecord> {
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();

        // `encodePatchWith` never injects defaults (by design), so the updatedAt
        // stamp stays explicit.
        const setValues: Record<string, unknown> = {};

        if (this.updatedAtCol !== false && this.updatedAtCol in cols)
            setValues[this.updatedAtCol] = now;

        if ('updatedBy' in cols && data.updatedBy !== undefined)
            setValues['updatedBy'] = data.updatedBy;

        const fields = data.fields ?? {};
        for (const [key, value] of Object.entries(fields)) {
            if (!reserved.has(key) && key in cols) {
                setValues[key] = value;
            }
        }

        const row = await this.db
            .updateTable(this.tableKey)
            .set(encodePatchWith(this.table, setValues))
            .where(this.idCol, '=', this.serialize(this.col(this.idCol), id))
            .returningAll()
            .executeTakeFirst();

        if (!row) throw new Error(`tableStorage: no row found for id "${id}"`);
        return this.rowToRecord(row);
    }

    async get(id: string): Promise<EntryRecord | null> {
        const row = await this.db
            .selectFrom(this.tableKey)
            .selectAll()
            .where(this.idCol, '=', this.serialize(this.col(this.idCol), id))
            .limit(1)
            .executeTakeFirst();

        if (!row) return null;
        return this.rowToRecord(row);
    }

    async delete(id: string): Promise<void> {
        await this.db
            .deleteFrom(this.tableKey)
            .where(this.idCol, '=', this.serialize(this.col(this.idCol), id))
            .execute();
    }

    /**
     * The returned callback throws for a `searchFields`/`where` key naming a
     * column the table doesn't have — Kysely evaluates it eagerly at `.where()`,
     * so the config bug surfaces as a rejected `list()`.
     */
    private buildWhere(params: ListParams): WhereFn {
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [];

            // search + searchFields
            if (params.search && params.searchFields && params.searchFields.length > 0) {
                const term = `%${params.search}%`;
                const orClauses = params.searchFields.map((fieldName) => {
                    this.col(fieldName); // throws if missing — config bug
                    return eb(fieldName, 'like', term);
                });
                const [only] = orClauses;
                conditions.push(orClauses.length === 1 && only ? only : eb.or(orClauses));
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
                            const list = (v['in'] as unknown[]).map((item) =>
                                this.serialize(col, item)
                            );
                            conditions.push(eb(key, 'in', list));
                        } else if ('like' in v && typeof v['like'] === 'string') {
                            // A LIKE pattern is a SQL literal, never a domain value.
                            conditions.push(eb(key, 'like', v['like']));
                        } else {
                            conditions.push(eb(key, '=', this.serialize(col, value)));
                        }
                    } else if (Array.isArray(value)) {
                        const list = (value as unknown[]).map((item) =>
                            this.serialize(col, item)
                        );
                        conditions.push(eb(key, 'in', list));
                    } else {
                        conditions.push(eb(key, '=', this.serialize(col, value)));
                    }
                }
            }

            // An empty list renders as `1 = 1` — an unfiltered query.
            return eb.and(conditions);
        };
    }

    /** Unknown sort columns are skipped silently (unlike searchFields). */
    private buildOrderBy(params: ListParams): OrderPair[] {
        const cols = this.getColumns();
        const pairs: OrderPair[] = [];

        if (params.sort) {
            const sorts = Array.isArray(params.sort) ? params.sort : [params.sort];
            for (const s of sorts) {
                for (const [field, dir] of Object.entries(s)) {
                    if (!(field in cols)) continue;
                    pairs.push([field, dir === 'asc' ? 'asc' : 'desc']);
                }
            }
        }

        if (pairs.length === 0 && this.createdAtCol !== false) {
            if (this.createdAtCol in cols) pairs.push([this.createdAtCol, 'desc']);
        }

        return pairs;
    }

    async list(params: ListParams): Promise<{ data: EntryRecord[]; total: number }> {
        const db = this.db;
        const whereFn = this.buildWhere(params);
        const orderPairs = this.buildOrderBy(params);

        const limit = params.limit;
        const page = params.page ?? 1;

        if (limit === 'all') {
            let q = db.selectFrom(this.tableKey).selectAll().where(whereFn);
            for (const [column, dir] of orderPairs) {
                q = q.orderBy(column, dir);
            }
            const rows = await q.execute();
            const data = rows.map((r) => this.rowToRecord(r));
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const countRow = await db
            .selectFrom(this.tableKey)
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where(whereFn)
            .executeTakeFirst();
        const total = Number(countRow?.c ?? 0);

        let rowsQ = db
            .selectFrom(this.tableKey)
            .selectAll()
            .where(whereFn)
            .limit(perPage)
            .offset(offset);
        for (const [column, dir] of orderPairs) {
            rowsQ = rowsQ.orderBy(column, dir);
        }
        const rows = await rowsQ.execute();

        const data = rows.map((r) => this.rowToRecord(r));
        return { data, total };
    }
}

/**
 * Create an EntryStorage backed by an arbitrary `defineTable` descriptor.
 *
 * Every column that is not the id/timestamp/actor-reserved set is treated as a
 * field; `EntryRecord.fields` is `{ [columnKey]: value }` for all such columns.
 * Capabilities are all off (supports: []); the entry type config must disable
 * statuses, slug, trash, translatable, and versioning.
 */
export function tableStorage(
    table: TableDescriptor,
    options?: TableStorageOptions
): EntryStorage {
    const instance = new TableStorage(table, options);
    if (!supportsTransactions()) {
        // `transaction` is a prototype method, so an own `undefined` property
        // shadows it — same "degrade, don't throw" contract as built-in
        // storage: EntryStorage.transaction is optional and every caller
        // already falls back to sequential writes.
        (instance as unknown as { transaction: undefined }).transaction = undefined;
    }
    return instance as EntryStorage;
}
