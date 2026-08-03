/**
 * tableStorage — EntryStorage implementation over an arbitrary `defineTable`
 * descriptor.
 *
 * This is an *adapter*, not a query layer: every read and write goes through
 * `createStorage` (`database/storage/create-storage.ts`), which owns the `where`
 * DSL, value serialization and row decoding. That file documents the semantics —
 * bare `null` means `IS NULL`, unknown column keys throw, `like` patterns are
 * raw — and is the only place they are implemented. `list` is the one method on
 * the raw handle, and it still compiles its filters with the wrapper's own
 * `where` (handed out by `query()`) rather than restating them.
 *
 * What this adapter adds on top:
 *
 * Maps any descriptor to the EntryStorage contract by treating every column
 * that is not the id/timestamp/actor-reserved set as a "field". Declares no
 * capabilities (supports: []) — statuses, slug, trash, versioning, and
 * translatable must all be disabled for any entry type using this storage.
 *
 * Column keys are the descriptor's camelCase keys throughout: `fields`, `where`,
 * `sort` and `searchFields` are all keyed by them.
 *
 * When `timestamps: false`, createdAt/updatedAt return new Date(0) and are not
 * written by the adapter. createdBy/updatedBy are written only when those
 * columns are present on the descriptor.
 *
 * search + searchFields: OR-LIKE across the named columns — the one predicate
 * the flat `where` DSL cannot express, so `list` ANDs it onto the compiled DSL
 * filter as a raw clause, in the same statement. If searchFields names a column
 * not on the table, throws at list-time (config bug — crash loud). If search is
 * set but no searchFields, search is a no-op.
 *
 * sort: field names must match column names (id, createdAt, updatedAt, or any
 * field column); unknown names are skipped silently.
 *
 * uniqueSlug: not supported — throws with an instructional error.
 * transaction: wraps fn in a Kysely tx, rebinding a new tableStorage instance.
 *   Absent entirely when the active driver has no interactive transactions.
 */

import { supportsTransactions } from '@/database/capabilities.js';
import {
    createStorage,
    type QueryHandle,
    type Storage,
} from '@/database/storage/create-storage.js';
import { decodeWith } from '@/database/codec.js';
import type { Column, TableDescriptor } from '@/database/define-table.js';
import type { Db } from '@/database/types.js';
import { RelationshipFilterUnsupportedError } from '../errors.js';
import type { JsonObject } from '@/types/index.js';
import type {
    EntryRecord,
    EntryStorage,
    EntryWrite,
    ListParams,
    StorageDb,
} from './types.js';

type OrderPair = [column: string, direction: 'asc' | 'desc'];

/** The wrapper's compiled `where`, the shape a raw clause has to AND onto. */
type Predicate = ReturnType<QueryHandle<TableDescriptor>['where']>;

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

    /**
     * Assigned in the constructor only when the active driver supports
     * interactive transactions — an own `undefined` property would still
     * satisfy `'transaction' in storage`, so degrading means never assigning
     * it at all. `EntryStorage.transaction` is optional and every caller
     * already falls back to sequential writes.
     */
    public transaction?: <T>(
        fn: (storage: EntryStorage<EntryRecord>, db: StorageDb) => Promise<T>
    ) => Promise<T>;

    private readonly table: TableDescriptor;
    private readonly storage: Storage<TableDescriptor>;
    private readonly idCol: string;
    private readonly createdAtCol: string | false;
    private readonly updatedAtCol: string | false;

    constructor(table: TableDescriptor, options?: TableStorageOptions, db?: Db) {
        this.table = table;
        this.storage = createStorage(table, db);
        this.idCol = options?.idColumn ?? 'id';

        if (options?.timestamps === false) {
            this.createdAtCol = false;
            this.updatedAtCol = false;
        } else {
            this.createdAtCol = options?.timestamps?.createdAt ?? 'createdAt';
            this.updatedAtCol = options?.timestamps?.updatedAt ?? 'updatedAt';
        }

        // `EntryStorage.transaction` is optional and every caller
        // (operations/create.ts, internal/bulk.ts, operations/staging/merge.ts)
        // already falls back to sequential writes, so leaving it unassigned on a
        // driver without interactive transactions (D1) degrades correctly
        // instead of throwing at runtime.
        if (supportsTransactions()) {
            this.transaction = async <T>(
                fn: (storage: EntryStorage<EntryRecord>, db: StorageDb) => Promise<T>
            ): Promise<T> => {
                const { db } = this.storage.query();
                return db.transaction().execute(async (trx) => {
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
                        trx as unknown as Db
                    );
                    return fn(txStorage, trx as unknown as StorageDb);
                });
            };
        }
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

    /** Build an EntryRecord from a decoded (domain-shaped) row. */
    private toRecord(row: Record<string, unknown>): EntryRecord {
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

    uniqueSlug(): Promise<string> {
        throw new Error(
            'tableStorage does not support slugs; disable the slug capability for this entry type'
        );
    }

    async create(data: EntryWrite & { type: string }): Promise<EntryRecord> {
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();

        // The id is NOT minted here — `createStorage.create` runs `encodeWith`,
        // which fills any column carrying an app default (col.id() → ULID,
        // col.timestamp({ defaultNow }) → now) that is still undefined.
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

        return this.toRecord(await this.storage.create(insertValues));
    }

    async update(id: string, data: EntryWrite): Promise<EntryRecord> {
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const setValues: Record<string, unknown> = {};

        // `createStorage.update` stamps every column the descriptor marks
        // `onUpdate`, so the ordinary case (`updatedAt` declared with
        // `onUpdate: true`) needs no explicit stamp. The explicit stamp survives
        // for the case the descriptor cannot express: an updatedAt column this
        // adapter was *configured* onto that is not marked `onUpdate`.
        //
        // The two can also disagree the other way — `timestamps: false` against
        // a descriptor column marked `onUpdate`, which is still stamped. That is
        // correct: `onUpdate` is the table's own declaration about its column,
        // while `timestamps: false` only says this adapter neither manages nor
        // reports entry timestamps.
        const updatedAtCol = this.updatedAtCol;
        if (updatedAtCol !== false && cols[updatedAtCol]?.onUpdate === false)
            setValues[updatedAtCol] = new Date();

        if ('updatedBy' in cols && data.updatedBy !== undefined)
            setValues['updatedBy'] = data.updatedBy;

        const fields = data.fields ?? {};
        for (const [key, value] of Object.entries(fields)) {
            if (!reserved.has(key) && key in cols) {
                setValues[key] = value;
            }
        }

        // By-id writes go through the where-based `updateMany`/`deleteMany`
        // rather than the wrapper's by-primary-key `update`/`delete`, because
        // `idColumn` is configurable and need not be the descriptor's primary
        // key — keying on the wrong column would silently write the wrong row.
        const affected = await this.storage.updateMany({ [this.idCol]: id }, setValues);
        if (affected === 0) throw new Error(`tableStorage: no row found for id "${id}"`);

        const row = await this.get(id);
        if (!row) throw new Error(`tableStorage: no row found for id "${id}"`);
        return row;
    }

    async get(id: string): Promise<EntryRecord | null> {
        const row = await this.storage.findOne({ [this.idCol]: id });
        return row ? this.toRecord(row) : null;
    }

    async delete(id: string): Promise<void> {
        await this.storage.deleteMany({ [this.idCol]: id });
    }

    /**
     * `params.where` → the shared `where` DSL. `locale` is dropped because a
     * table-backed entry type has no locale concept; the shared builder throws
     * on any key that is not a column, so the knowledge that this key is not
     * columnar has to live here. `references` is refused outright rather than
     * dropped — silently ignoring it would return every row.
     */
    private whereFilters(params: ListParams): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(params.where ?? {})) {
            if (key === 'locale') continue; // no locale concept
            if (key === 'references') {
                const type = params.type;
                throw new RelationshipFilterUnsupportedError(
                    Array.isArray(type) ? type.join(', ') : String(type)
                );
            }
            out[key] = value;
        }
        return out;
    }

    /**
     * The columns `search` runs over, or `[]` when no search is active.
     *
     * A `searchFields` entry naming a column the table doesn't have throws —
     * config bug, crash loud.
     */
    private searchColumns(params: ListParams): string[] {
        const fields = params.searchFields;
        if (
            params.search === undefined ||
            params.search === '' ||
            fields === undefined ||
            fields.length === 0
        ) {
            return [];
        }

        const cols = this.getColumns();
        for (const field of fields) {
            if (!(field in cols)) {
                throw new Error(`tableStorage: column "${field}" not found on table`);
            }
        }

        return [...fields];
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
        const { db, table, where } = this.storage.query();

        // One predicate for both the count and the rows, so the two cannot
        // drift: the DSL filters compiled by the wrapper, ANDed with the search
        // OR the DSL cannot express.
        const dsl = where(this.whereFilters(params));
        const searchColumns = this.searchColumns(params);
        const term = `%${params.search ?? ''}%`;
        const predicate: Predicate =
            searchColumns.length === 0
                ? dsl
                : (eb) =>
                      eb.and([
                          dsl(eb),
                          eb.or(searchColumns.map((col) => eb(col, 'like', term))),
                      ]);

        let rowsQuery = db.selectFrom(table).selectAll().where(predicate);
        for (const [column, direction] of this.buildOrderBy(params)) {
            rowsQuery = rowsQuery.orderBy(column, direction);
        }

        const toRecords = (rows: Record<string, unknown>[]): EntryRecord[] =>
            rows.map((row) => this.toRecord(decodeWith(this.table, row)));

        const limit = params.limit;
        if (limit === 'all') {
            const data = toRecords(await rowsQuery.execute());
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = ((params.page ?? 1) - 1) * perPage;

        const counted = await db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .where(predicate)
            .executeTakeFirst();
        const rows = await rowsQuery.limit(perPage).offset(offset).execute();

        return { data: toRecords(rows), total: Number(counted?.total ?? 0) };
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
    return new TableStorage(table, options) as EntryStorage;
}
