/**
 * tableRepository — an EntryRepository over an arbitrary `Table`. Every read and
 * write goes through `createRepository`, which owns the `where` DSL, value
 * serialization and decoding. Column keys are the table's camelCase keys throughout.
 */

import type {
    EntryRef,
    EntryRepository,
    EntryRow,
    EntryWrite,
    ListParams,
} from './types';
import type { ContentRowId } from '@/content/repository/types';
import type { Column, Table } from '@/database/define-table';
import type { KyselyHandle, Repository } from '@/database/repository/create-repository';
import type { Where } from '@/database/repository/where';
import type { Db } from '@/database/types';
import type { JsonObject, ReferencesFilter } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { chunks } from '@/database/chunks';
import { decodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { isReferencesFilter } from './references-filter';

type OrderPair = [column: string, direction: 'asc' | 'desc'];

/** The expression builder the list predicate is compiled against. */
type ListEb = Parameters<ReturnType<KyselyHandle<Table>['where']>>[0];

export type TableRepositoryOptions = {
    /** Primary key column name, declared with `col.id()`. Default 'id'. */
    idColumn?: string;
    /**
     * Managed timestamp column names; pass false to disable.
     * Default { createdAt: 'createdAt', updatedAt: 'updatedAt' }.
     * When false, createdAt/updatedAt return new Date(0) and are not written.
     */
    timestamps?: { createdAt?: string; updatedAt?: string } | false;
};

class TableRepository implements EntryRepository<EntryRow> {
    public readonly supports: readonly never[] = Object.freeze([]);

    private readonly table: Table;
    private readonly repository: Repository<Table>;
    private readonly idCol: string;
    private readonly createdAtCol: string | false;
    private readonly updatedAtCol: string | false;

    constructor(table: Table, options?: TableRepositoryOptions, db?: Db) {
        this.table = table;
        this.repository = createRepository(table, db);
        this.idCol = options?.idColumn ?? 'id';

        // Both sides of the relationships index assume an id is unique across
        // resources, and only an id column guarantees that (`DECISIONS.md`).
        if (table.columns[this.idCol]?.kind !== 'id') {
            throw new Error(
                `tableRepository: the id column "${this.idCol}" of table "${table.name}" ` +
                    `must be declared with col.id(), because relationship ids are unique ` +
                    `across resources.`
            );
        }

        if (options?.timestamps === false) {
            this.createdAtCol = false;
            this.updatedAtCol = false;
        } else {
            this.createdAtCol = options?.timestamps?.createdAt ?? 'createdAt';
            this.updatedAtCol = options?.timestamps?.updatedAt ?? 'updatedAt';
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

    /** Build an EntryRow from a decoded (domain-shaped) row. */
    private toRecord(row: Record<string, unknown>): EntryRow {
        const reserved = this.reservedNames();
        const cols = this.getColumns();
        const fields: Record<string, unknown> = {};

        for (const key of Object.keys(cols)) {
            if (reserved.has(key)) continue;
            fields[key] = row[key] ?? null;
        }

        const idVal = row[this.idCol];
        const id = typeof idVal === 'string' ? idVal : String(idVal);

        // A custom table's row is its own content: one locale, never staged,
        // and the public id doubles as the content-row id.
        const locale = getDefaultContentLocale();
        const record: EntryRow = {
            id,
            contentId: id as ContentRowId,
            locale,
            locales: [locale],
            staged: false,
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

    uniqueSlug(
        _type: string,
        _locale: string,
        _baseSlug: string,
        _excludeId?: string
    ): Promise<string> {
        throw new Error(
            'tableRepository does not support slugs; disable the slug capability for this entry type'
        );
    }

    async create(data: EntryWrite & { type: string }): Promise<EntryRow> {
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const now = new Date();

        // The id is NOT minted here — `createRepository.create` runs `encodeWith`,
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

        return this.toRecord(await this.repository.create(insertValues));
    }

    async update(ref: EntryRef, data: EntryWrite): Promise<EntryRow> {
        const id = ref.id;
        const cols = this.getColumns();
        const reserved = this.reservedNames();
        const setValues: Record<string, unknown> = {};

        // `createRepository.update` stamps every column the table marks
        // `onUpdate`, so the ordinary case (`updatedAt` declared with
        // `onUpdate: true`) needs no explicit stamp. The explicit stamp survives
        // for the case the table cannot express: an updatedAt column this
        // adapter was *configured* onto that is not marked `onUpdate`.
        //
        // The two can also disagree the other way — `timestamps: false` against
        // a table column marked `onUpdate`, which is still stamped. That is
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
        // `idColumn` is configurable and need not be the table's primary
        // key — keying on the wrong column would silently write the wrong row.
        const affected = await this.repository.updateMany(
            { [this.idCol]: id },
            setValues
        );
        if (affected === 0)
            throw new Error(`tableRepository: no row found for id "${id}"`);

        const row = await this.findById(id);
        if (!row) throw new Error(`tableRepository: no row found for id "${id}"`);
        return row;
    }

    async get(ref: EntryRef & { type: string }): Promise<EntryRow | null> {
        // The table holds one type, so the registry has already routed by it.
        return this.findById(ref.id);
    }

    private async findById(id: string): Promise<EntryRow | null> {
        const row = await this.repository.findOne({ [this.idCol]: id });
        return row ? this.toRecord(row) : null;
    }

    async delete(id: string): Promise<void> {
        await this.repository.deleteMany({ [this.idCol]: id });
    }

    /**
     * Ids with a row in this table. Chunked — D1 caps a query at 100 binds.
     * Selects the id column alone through `kysely()`: `findMany` reads and
     * decodes every column of every matched row to answer a yes/no.
     */
    async existingIds(ids: string[]): Promise<Set<string>> {
        const found = new Set<string>();
        const { db, table, where } = this.repository.kysely();
        for (const chunk of chunks(ids)) {
            const rows = await db
                .selectFrom(table)
                .select(this.idCol)
                .where(where({ [this.idCol]: { in: chunk } }))
                .execute();
            for (const row of rows) found.add(String(row[this.idCol]));
        }
        return found;
    }

    /**
     * `params.where` split in two: the column filters, for the shared `where`
     * DSL, and the `references` filter, which the DSL cannot express and `list`
     * compiles to a subquery instead. `locale` is dropped because a custom-table
     * entry type has no locale concept.
     */
    private whereFilters(params: ListParams): {
        filters: Where<Table>;
        references: ReferencesFilter | null;
    } {
        const filters: Where<Table> = {};
        let references: ReferencesFilter | null = null;
        for (const [key, value] of Object.entries(params.where ?? {})) {
            if (key === 'locale') continue; // no locale concept
            if (key === 'references') {
                if (isReferencesFilter(value)) references = value;
                continue;
            }
            filters[key] = value;
        }
        return { filters, references };
    }

    /**
     * `EXISTS` against the relationships index for one row of this table,
     * correlated on the id column.
     *
     * Unlike the entries-table version, this also matches `sourceType`. An id is
     * unique across resources, so the condition excludes nothing; it is there so
     * the lookup can use `idx_rel_filter` on `(sourceType, schemaPath, targetId)`.
     */
    private referencesExists(
        eb: ListEb,
        table: string,
        sourceType: string,
        filter: ReferencesFilter
    ): Expression<SqlBool> {
        return eb.exists(
            eb
                .selectFrom('relationships')
                .select('relationships.sourceId')
                .whereRef('relationships.sourceId', '=', `${table}.${this.idCol}`)
                .where('relationships.sourceKind', '=', 'entry')
                .where('relationships.sourceType', '=', sourceType)
                .where('relationships.schemaPath', '=', filter.path)
                .where('relationships.targetId', '=', filter.id)
        );
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
                throw new Error(`tableRepository: column "${field}" not found on table`);
            }
        }

        return [...fields];
    }

    /** An unknown sort column throws, as an unknown searchField does: a typo
     *  must not quietly answer differently-ordered data (`DECISIONS.md`, "An
     *  unknown entries-list `where` or sort key throws"). */
    private buildOrderBy(params: ListParams): OrderPair[] {
        const cols = this.getColumns();
        const fallback =
            this.createdAtCol !== false && this.createdAtCol in cols
                ? [{ field: this.createdAtCol, direction: 'desc' as const }]
                : [];
        return buildOrderBy(Object.keys(cols), params.sort, fallback).map(
            ({ field, direction }): OrderPair => [field, direction]
        );
    }

    /**
     * One page of rows. The column filters, the search and the `references`
     * subquery are ANDed into one predicate that both the count and the rows
     * query use, so the total always counts the rows the page is drawn from.
     */
    async list(params: ListParams): Promise<{ data: EntryRow[]; total: number }> {
        const { db, table, where } = this.repository.kysely();

        const { filters, references } = this.whereFilters(params);
        const searchColumns = this.searchColumns(params);
        const search = params.search ?? '';
        const columnPredicate = where(
            searchColumns.length === 0
                ? filters
                : {
                      ...filters,
                      or: searchColumns.map((col) => ({ [col]: { contains: search } })),
                  }
        );

        let predicate = columnPredicate;
        if (references !== null) {
            const sourceType = referencedSourceType(params.type);
            predicate = (eb) =>
                eb.and([
                    columnPredicate(eb),
                    this.referencesExists(eb, table, sourceType, references),
                ]);
        }

        let rowsQuery = db.selectFrom(table).selectAll().where(predicate);
        for (const [column, direction] of this.buildOrderBy(params)) {
            rowsQuery = rowsQuery.orderBy(column, direction);
        }

        const toRecords = (rows: Record<string, unknown>[]): EntryRow[] =>
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
 * The entry type a `references` filter matches `relationships.sourceType`
 * against. A custom table holds one type, and `entries.query` refuses a query
 * naming a custom-table type among other types, so a list of more than one is a
 * bug in the caller.
 */
function referencedSourceType(type: ListParams['type']): string {
    if (typeof type === 'string') return type;
    const [only, ...rest] = type;
    if (only !== undefined && rest.length === 0) return only;
    throw new Error(
        `tableRepository: where.references needs a single entry type, got ${type.join(', ')}`
    );
}

/**
 * Create an EntryRepository backed by an arbitrary `Table`. Every column outside
 * the id/timestamp/actor-reserved set becomes a key of `EntryRow.fields`.
 * Capabilities are all off, so the entry type config must disable every one.
 */
export function tableRepository(
    table: Table,
    options?: TableRepositoryOptions
): TableRepository {
    return new TableRepository(table, options);
}

/** The type `EntryType['repository']` takes: a repository `tableRepository()` built. */
export type CustomTableRepository = TableRepository;
