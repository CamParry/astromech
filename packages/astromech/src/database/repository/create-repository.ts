/**
 * `createRepository` — the generic, `defineTable`-backed CRUD object. One
 * `Table` in, a typed find/create/update/delete/upsert surface out. The
 * wrapper serializes every value crossing into SQL via the column codec.
 */

import type { Where, WhereFn } from './where';
import type {
    ColumnRuntime,
    Table,
    TableInsert,
    TableSelect,
    TableUpdate,
} from '@/database/define-table';
import type { Db } from '@/database/types';
import type { Kysely, SelectQueryBuilder } from 'kysely';
import {
    decodeWith,
    encodePatchWith,
    encodeWith,
    kyselyTableKey,
} from '@/database/codec';
import { getDb } from '@/database/registry';
import { AstromechError } from '@/errors/astromech-error';
import { compileWhere, serialize } from './where';

/**
 * A `Table` may be any shape, so the wrapper queries through a fully
 * generic `DB` interface rather than the typed core one. Correctness of the
 * values crossing the boundary comes from the column codec, not from Kysely.
 */
type Schema = Record<string, Record<string, unknown>>;

/** The generic Kysely handle handed out by `kysely()`. */
export type GenericDb = Kysely<Schema>;

export type OrderBy<D> = readonly (readonly [
    keyof TableSelect<D> & string,
    'asc' | 'desc',
])[];

export type FindManyParams<D> = {
    where?: Where<D>;
    orderBy?: OrderBy<D>;
    limit?: number;
    offset?: number;
};

/**
 * An update patch, widened to admit explicit `undefined` per key.
 *
 * `TableUpdate<D>` is `Partial<TableInsert<D>>`, and under
 * `exactOptionalPropertyTypes` a `Partial` rejects an explicitly-`undefined`
 * value — so the natural forwarding call `update(id, { title: data.title })`,
 * where `data.title` is `string | undefined`, fails to compile. Callers were
 * otherwise forced into `...(x !== undefined && { x })` spreads at every field.
 *
 * Widening here rather than on `TableUpdate` itself is deliberate: that type
 * also describes domain row updates elsewhere, where the strictness is wanted.
 * `undefined` means "leave this column alone" — the same meaning it already has
 * in `Where<D>` — and `encodePatchWith` strips undefined keys before the write.
 */
export type Patch<D> = {
    [K in keyof TableUpdate<D>]?: TableUpdate<D>[K] | undefined;
};

export type UpsertOptions<D> = {
    /** Conflict target columns. Defaults to the table's primary key. */
    target?: readonly string[];
    /** Columns to write on conflict. Defaults to all provided non-target columns. */
    set?: Patch<D>;
};

export type CreateManyOptions = {
    /**
     * `'ignore'` emits `ON CONFLICT DO NOTHING`: a row colliding with an
     * existing one is skipped rather than throwing. Spelled as the SQL it
     * emits, not as Prisma's `skipDuplicates`.
     */
    onConflict?: 'ignore';
};

/**
 * What `kysely()` hands out: the generic Kysely handle, the resolved table key,
 * and the wrapper's own `where` compiler.
 *
 * `where` is exposed because the escape hatch is otherwise all-or-nothing. A
 * query mixing an ordinary filter with something only raw SQL can say would
 * otherwise have to restate the filter by hand, leaving two copies that must
 * agree exactly. Handing back the compiler makes the mixed case one statement:
 *
 * ```ts
 * const { db, table, where } = repository.kysely();
 * db.selectFrom(table)
 *     .selectAll()
 *     .where((eb) => eb.and([where(dslFilter)(eb), rawClause(eb)]));
 * ```
 *
 * The caller still owns decoding (`decodeWith(repository.table, row)`).
 *
 * The hatch is named for the engine on purpose: it carries no compatibility
 * promise, and Kysely types cross the public surface only through its return
 * type.
 */
export type KyselyHandle<D> = {
    db: GenericDb;
    table: string;
    where: (where?: Where<D>) => WhereFn;
};

export type Repository<D extends Table> = {
    /** The `Table` this repository is bound to. */
    table: D;
    findOne(where: Where<D>): Promise<TableSelect<D> | null>;
    findMany(params?: FindManyParams<D>): Promise<TableSelect<D>[]>;
    /**
     * One column's decoded values for the matched rows — the same params as
     * `findMany`, without reading and decoding every other column.
     */
    pluck<K extends keyof TableSelect<D> & string>(
        column: K,
        params?: FindManyParams<D>
    ): Promise<TableSelect<D>[K][]>;
    count(where?: Where<D>): Promise<number>;
    create(data: TableInsert<D>): Promise<TableSelect<D>>;
    /**
     * Insert many rows, returning how many landed. Rows carrying the same
     * columns go out as one statement; a row that omits a column another row
     * sets starts a second one, so the database still applies that column's
     * default. An empty array is a no-op returning 0 — Kysely rejects an empty
     * `values()`.
     */
    createMany(
        rows: readonly TableInsert<D>[],
        opts?: CreateManyOptions
    ): Promise<number>;
    /** By primary key. Throws when no row matched. */
    update(id: string, patch: Patch<D>): Promise<TableSelect<D>>;
    /** By primary key. Hard delete — soft delete stays a domain policy. */
    delete(id: string): Promise<void>;
    /** Returns the affected row count; 0 silently when nothing matched. */
    updateMany(where: Where<D>, patch: Patch<D>): Promise<number>;
    deleteMany(where: Where<D>): Promise<number>;
    upsert(data: TableInsert<D>, opts?: UpsertOptions<D>): Promise<TableSelect<D>>;
    /**
     * The raw escape hatch, for aggregates, expression filters and anything
     * else the DSL cannot express. See {@link KyselyHandle}.
     */
    kysely(): KyselyHandle<D>;
};

export function createRepository<D extends Table>(table: D, db?: Db): Repository<D> {
    const tableKey = kyselyTableKey(table.name);
    const columns: Record<string, ColumnRuntime> = table.columns;
    // A table-level composite key wins: no column carries the inline flag, so
    // deriving from flags alone would report the table as having no key at all.
    const primaryKey =
        table.primaryKey ??
        Object.keys(columns).filter((key) => columns[key]?.primaryKey);

    // `whereFn` reads every key as a column, so a column named `or` would be
    // unreachable through the DSL. Fail at construction, not at the query that
    // silently drops the filter.
    if ('or' in columns) {
        throw new AstromechError(
            `createRepository("${table.name}"): "or" is reserved by the where ` +
                `DSL and cannot be a column name — rename the column.`
        );
    }

    /** Resolved per call so an unbound repository follows `setDb` across a reload. */
    function handle(): GenericDb {
        return (db ?? getDb()) as unknown as GenericDb;
    }

    /** Column by key; throws for an unknown key (config bug). */
    function column(name: string): ColumnRuntime {
        const col = columns[name];
        if (!col) {
            throw new AstromechError(
                `createRepository("${table.name}"): unknown column "${name}"`
            );
        }
        return col;
    }

    /** The single primary-key column; throws when the table has none or many. */
    function idColumn(): string {
        const [only] = primaryKey;
        if (primaryKey.length !== 1 || only === undefined) {
            throw new AstromechError(
                `createRepository("${table.name}"): update/delete by id ` +
                    `needs exactly one primary-key column, found ${primaryKey.length}. ` +
                    `Use updateMany/deleteMany with an explicit where.`
            );
        }
        return only;
    }

    function whereFn(where?: Where<D>): WhereFn {
        return compileWhere(table, where);
    }

    function decodeRow(row: Record<string, unknown>): TableSelect<D> {
        return decodeWith(table, row);
    }

    // writes

    /**
     * Patch → encoded cells. `encodePatchWith` never injects defaults, so the
     * `onUpdate` stamp is the wrapper's job — every `col.timestamp({ onUpdate })`
     * column the caller did not supply is stamped `now`.
     */
    function encodeUpdate(patch: object): Record<string, unknown> {
        const values: Record<string, unknown> = { ...asRecord(patch) };
        const now = new Date();
        for (const [key, col] of Object.entries(columns)) {
            if (col.onUpdate && values[key] === undefined) values[key] = now;
        }
        return encodePatchWith(table, values);
    }

    // surface

    /**
     * where + orderBy + limit/offset, shared by `findMany` and `pluck`.
     *
     * SQLite's grammar only admits OFFSET *inside* a LIMIT clause, so an
     * offset with no limit is a syntax error at the driver rather than an
     * unbounded skip — which is exactly what "everything past the first N"
     * (version trimming, tail pagination) asks for. `LIMIT -1` is SQLite's
     * documented idiom for no limit. Postgres spells it `LIMIT ALL`, so this
     * line moves behind the dialect seam when that driver lands.
     */
    function shapeSelect<O>(
        q: SelectQueryBuilder<Schema, string, O>,
        params?: FindManyParams<D>
    ): SelectQueryBuilder<Schema, string, O> {
        let out = q.where(whereFn(params?.where));
        for (const [key, direction] of params?.orderBy ?? []) {
            out = out.orderBy(key, direction);
        }
        if (params?.limit !== undefined) out = out.limit(params.limit);
        else if (params?.offset !== undefined) out = out.limit(-1);
        if (params?.offset !== undefined) out = out.offset(params.offset);
        return out;
    }

    async function findOne(where: Where<D>): Promise<TableSelect<D> | null> {
        const row = await handle()
            .selectFrom(tableKey)
            .selectAll()
            .where(whereFn(where))
            .limit(1)
            .executeTakeFirst();
        return row ? decodeRow(row) : null;
    }

    async function findMany(params?: FindManyParams<D>): Promise<TableSelect<D>[]> {
        const rows = await shapeSelect(
            handle().selectFrom(tableKey).selectAll(),
            params
        ).execute();
        return rows.map((row) => decodeRow(row));
    }

    async function pluck<K extends keyof TableSelect<D> & string>(
        name: K,
        params?: FindManyParams<D>
    ): Promise<TableSelect<D>[K][]> {
        column(name); // an unknown column throws here, as it does in `where`
        const rows = await shapeSelect(
            handle().selectFrom(tableKey).select(name),
            params
        ).execute();
        // `decodeWith` skips absent columns, so a one-column row decodes fine.
        return rows.map((row) => decodeRow(row as Record<string, unknown>)[name]);
    }

    async function count(where?: Where<D>): Promise<number> {
        const row = await handle()
            .selectFrom(tableKey)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .where(whereFn(where))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    async function create(data: TableInsert<D>): Promise<TableSelect<D>> {
        // `encodeWith` fills every column carrying an app default (ULID id,
        // `defaultNow` timestamps) before serializing.
        const row = await handle()
            .insertInto(tableKey)
            .values(encodeWith(table, asRecord(data)))
            .returningAll()
            .executeTakeFirst();
        if (!row) {
            throw new AstromechError(
                `createRepository("${table.name}"): insert returned no row`
            );
        }
        return decodeRow(row);
    }

    async function createMany(
        rows: readonly TableInsert<D>[],
        opts?: CreateManyOptions
    ): Promise<number> {
        if (rows.length === 0) return 0;
        const encoded = rows.map((row) => asRecord(encodeWith(table, asRecord(row))));
        let inserted = 0;
        // Kysely writes one column list for a multi-row insert and renders a
        // column absent from a given row as a literal `null`, which overrides
        // that column's SQL DEFAULT instead of deferring to it: a row omitting
        // a defaulted column would store null, or trip NOT NULL. Grouping by
        // column set means each statement names only the columns its rows
        // carry and the database fills the rest, exactly as it does for
        // single-row `create`. Rows of one shape stay one statement.
        for (const group of groupByColumns(encoded)) {
            const insert = handle().insertInto(tableKey).values(group);
            const result = await (
                opts?.onConflict === 'ignore'
                    ? insert.onConflict((oc) => oc.doNothing())
                    : insert
            ).executeTakeFirst();
            inserted += Number(result.numInsertedOrUpdatedRows ?? 0);
        }
        return inserted;
    }

    async function update(id: string, patch: Patch<D>): Promise<TableSelect<D>> {
        const idCol = idColumn();
        const row = await handle()
            .updateTable(tableKey)
            .set(encodeUpdate(patch))
            .where(idCol, '=', serialize(column(idCol), id))
            .returningAll()
            .executeTakeFirst();
        if (!row) {
            throw new AstromechError(
                `createRepository("${table.name}"): no row found for ` +
                    `${idCol} "${id}"`
            );
        }
        return decodeRow(row);
    }

    async function del(id: string): Promise<void> {
        const idCol = idColumn();
        await handle()
            .deleteFrom(tableKey)
            .where(idCol, '=', serialize(column(idCol), id))
            .execute();
    }

    async function updateMany(where: Where<D>, patch: Patch<D>): Promise<number> {
        const result = await handle()
            .updateTable(tableKey)
            .set(encodeUpdate(patch))
            .where(whereFn(where))
            .executeTakeFirst();
        return Number(result.numUpdatedRows);
    }

    async function deleteMany(where: Where<D>): Promise<number> {
        const result = await handle()
            .deleteFrom(tableKey)
            .where(whereFn(where))
            .executeTakeFirst();
        return Number(result.numDeletedRows);
    }

    async function upsert(
        data: TableInsert<D>,
        opts?: UpsertOptions<D>
    ): Promise<TableSelect<D>> {
        const target = opts?.target ?? primaryKey;
        if (target.length === 0) {
            throw new AstromechError(
                `createRepository("${table.name}"): upsert needs a ` +
                    `conflict target — the table has no primary key, so pass \`target\`.`
            );
        }
        const values = encodeWith(table, asRecord(data));
        // An explicit `set` is an update, so it goes through the same `onUpdate`
        // stamping as `update`. The default set reuses the already-encoded insert
        // values, which `encodeWith` has stamped via each column's app default.
        const setValues =
            opts?.set === undefined
                ? omit(values, target)
                : encodeUpdate(opts.set as object);
        if (Object.keys(setValues).length === 0) {
            throw new AstromechError(
                `createRepository("${table.name}"): upsert has nothing ` +
                    `to set on conflict — pass \`set\`.`
            );
        }
        const row = await handle()
            .insertInto(tableKey)
            .values(values)
            .onConflict((oc) => oc.columns([...target]).doUpdateSet(setValues))
            .returningAll()
            .executeTakeFirst();
        if (!row) {
            throw new AstromechError(
                `createRepository("${table.name}"): upsert returned no row`
            );
        }
        return decodeRow(row);
    }

    function kysely(): KyselyHandle<D> {
        return { db: handle(), table: tableKey, where: whereFn };
    }

    return {
        table,
        findOne,
        findMany,
        pluck,
        count,
        create,
        createMany,
        update,
        delete: del,
        updateMany,
        deleteMany,
        upsert,
        kysely,
    };
}

/**
 * The `Table` row types are generic over `D`, so TypeScript cannot see that
 * they are plain records. This holds the single cast into a query call, rather
 * than scattering `as unknown as` through them. Coming back out, `decodeWith`
 * is already typed as the table's row.
 */
function asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
}

/**
 * Encoded rows bucketed by the set of columns they carry, first-seen order
 * kept. One bucket is one INSERT, which is what lets each statement name only
 * its own columns — see `createMany`.
 */
function groupByColumns(rows: Record<string, unknown>[]): Record<string, unknown>[][] {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
        // NUL joins the sorted names so a column containing the separator
        // cannot make two different shapes hash alike.
        const shape = Object.keys(row).sort().join('\0');
        const group = groups.get(shape);
        if (group) group.push(row);
        else groups.set(shape, [row]);
    }
    return [...groups.values()];
}

/** `%`, `_` and the escape character itself, so plain text matches literally. */

function omit(
    values: Record<string, unknown>,
    keys: readonly string[]
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        if (!keys.includes(key)) out[key] = value;
    }
    return out;
}
