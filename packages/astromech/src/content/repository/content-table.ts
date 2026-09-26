/**
 * `createContentRepository` — one implementation of the resource/content/
 * versions shape, addressed through a `ContentShape` rather than through
 * generated code per resource. Every table name, join column and codec comes
 * from the shape, so the only SQL naming a content table is here.
 */

import type {
    ContentRef,
    ContentRepository,
    ContentRepositoryOptions,
    ContentShape,
    ContentWrite,
    JoinedQuery,
    JoinedWhere,
    Resource,
    ResourceFilter,
    StoredRows,
} from './types';
import type { SortClause } from '@/content/list';
import type { Table } from '@/database/define-table';
import type { GenericDb } from '@/database/repository/create-repository';
import type { JsonObject } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { chunks, MAX_BOUND_PARAMETERS } from '@/database/chunks';
import { decodeWith, kyselyTableKey } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { transaction } from '@/database/transaction';
import { AstromechError } from '@/errors/astromech-error';
import { createVersionsRepository } from './versions';

/**
 * The alias prefix the resource row's columns are selected under, so a joined
 * read carries both rows in one flat record without either shadowing the other.
 * CamelCase so `CamelCasePlugin` round-trips it.
 */
const RESOURCE_PREFIX = 'resource';

function resourceAlias(column: string): string {
    return `${RESOURCE_PREFIX}${column.charAt(0).toUpperCase()}${column.slice(1)}`;
}

/** The write keys that are not content columns and never reach a row patch. */
const NON_COLUMN_KEYS = new Set(['locale']);

export function createContentRepository<
    R extends Resource,
    O extends Table,
    C extends Table,
    V extends Table,
>(
    shape: ContentShape<O, C, V>,
    opts: ContentRepositoryOptions<R, O, C>
): ContentRepository<R, V> {
    const dbOverride = opts.db;
    // Read per call rather than once, so a repository built before the config
    // resolves still answers with the configured default.
    const defaultLocale = (): string =>
        typeof opts.defaultLocale === 'function'
            ? opts.defaultLocale()
            : (opts.defaultLocale ?? getDefaultContentLocale());
    const { resourceIdColumn } = shape;
    const inheritedColumns = shape.inheritedColumns ?? [];
    const resourceKey = kyselyTableKey(shape.table.name);
    const contentKey = kyselyTableKey(shape.contentTable.name);
    const resourceColumns = Object.keys(shape.table.columns);
    const contentColumns = Object.keys(shape.contentTable.columns);
    const hasStagedFor = contentColumns.includes('stagedFor');
    const resourceHasUpdatedBy = resourceColumns.includes('updatedBy');
    const resourceFilter: ResourceFilter = opts.resourceFilter ?? (() => []);

    // Unbound when there is no override, so they follow `setDb` per call exactly
    // as `handle()` does.
    const resourceRows = createRepository(shape.table, dbOverride);
    const contents = createRepository(shape.contentTable, dbOverride);
    const versionsRepository = createVersionsRepository(shape.versionsTable, dbOverride);

    /** Resolved per call so an unbound repository follows `setDb` across a reload. */
    function db(): GenericDb {
        return (dbOverride ?? getDb()) as unknown as GenericDb;
    }

    /** Columns the insert paths fill in when the write does not name them. */
    const insertDefaults: Record<string, unknown> = {
        fields: {},
        ...(contentColumns.includes('status') ? { status: 'unpublished' } : {}),
        ...(contentColumns.includes('publishedAt') ? { publishedAt: null } : {}),
        ...shape.insertDefaults,
    };

    /**
     * A content-row INSERT: the write's own columns, the resource row's
     * inherited ones, and the defaults for whatever is still missing.
     */
    function insertValues(params: {
        id: string;
        locale: string;
        stagedFor: string | null;
        resourceRow: Record<string, unknown>;
        data: ContentWrite;
    }): Record<string, unknown> {
        const values: Record<string, unknown> = {
            [resourceIdColumn]: params.id,
            locale: params.locale,
            createdBy: params.data.createdBy ?? null,
            updatedBy: params.data.updatedBy ?? null,
        };
        if (hasStagedFor) values['stagedFor'] = params.stagedFor;
        for (const column of inheritedColumns) {
            values[column] = params.resourceRow[column];
        }
        for (const [key, value] of Object.entries(params.data)) {
            if (NON_COLUMN_KEYS.has(key) || value === undefined) continue;
            values[key] = value;
        }
        for (const [key, value] of Object.entries(insertDefaults)) {
            if (values[key] === undefined) values[key] = value;
        }
        return values;
    }

    /**
     * A content-row UPDATE. `createdBy` is an insert-only column, and `locale`
     * names the row rather than being written to it.
     */
    function patchValues(data: ContentWrite): Record<string, unknown> {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            if (NON_COLUMN_KEYS.has(key) || key === 'createdBy') continue;
            patch[key] = value;
        }
        return patch;
    }

    /**
     * Stamp the resource row's `updatedAt`, and its `updatedBy` where the table
     * has one and the write names it, so the resource row records the last
     * canonical write in any locale.
     */
    async function touch(id: string, updatedBy?: string | null): Promise<void> {
        await resourceRows.update(
            id,
            (resourceHasUpdatedBy && updatedBy !== undefined
                ? { updatedBy }
                : {}) as never
        );
    }

    /** `SELECT` over the join: every content column and every aliased resource column. */
    function joined(): JoinedQuery {
        let query = db()
            .selectFrom(contentKey)
            .innerJoin(
                resourceKey,
                `${resourceKey}.id`,
                `${contentKey}.${resourceIdColumn}`
            )
            .selectAll(contentKey);
        for (const column of resourceColumns) {
            query = query.select(
                `${resourceKey}.${column} as ${resourceAlias(column)}` as never
            );
        }
        return query;
    }

    async function count(where: JoinedWhere): Promise<number> {
        const row = await db()
            .selectFrom(contentKey)
            .innerJoin(
                resourceKey,
                `${resourceKey}.id`,
                `${contentKey}.${resourceIdColumn}`
            )
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where(where)
            .executeTakeFirst();
        return Number(row?.c ?? 0);
    }

    /** Split a joined record back into the two rows and decode each. */
    function split(row: Record<string, unknown>): {
        resourceRow: Record<string, unknown>;
        contentRow: Record<string, unknown>;
    } {
        const resourceRow: Record<string, unknown> = {};
        for (const column of resourceColumns) {
            resourceRow[column] = row[resourceAlias(column)];
        }
        const contentRow: Record<string, unknown> = {};
        for (const column of contentColumns) contentRow[column] = row[column];
        return {
            resourceRow: decodeWith(shape.table, resourceRow),
            contentRow: decodeWith(shape.contentTable, contentRow),
        };
    }

    /**
     * One grouped `SELECT <resourceIdColumn>, locale FROM <content>` over the page,
     * so a list of N rows costs one extra query rather than N.
     */
    async function locales(ids: string[]): Promise<Map<string, string[]>> {
        const byId = new Map<string, string[]>();
        if (ids.length === 0) return byId;

        const rows = await contents.findMany({
            where: {
                [resourceIdColumn]: { in: ids },
                ...(hasStagedFor ? { stagedFor: null } : {}),
            },
        });
        for (const row of rows) {
            const key = String((row as Record<string, unknown>)[resourceIdColumn]);
            const found = byId.get(key);
            if (found) found.push(String(row.locale));
            else byId.set(key, [String(row.locale)]);
        }
        for (const list of byId.values()) list.sort();
        return byId;
    }

    /** The resource rows and all their content rows; every resource without `ids`. */
    async function findStoredRows(ids?: readonly string[]): Promise<StoredRows> {
        if (ids === undefined) {
            return {
                resourceRows: await resourceRows.findMany(),
                contents: await contents.findMany(),
            };
        }
        const stored: StoredRows = { resourceRows: [], contents: [] };
        for (const chunk of chunks(ids)) {
            const resourceChunk = await resourceRows.findMany({
                where: { id: { in: chunk } },
            });
            const contentRows = await contents.findMany({
                where: { [resourceIdColumn]: { in: chunk } } as never,
            });
            stored.resourceRows.push(...(resourceChunk as Record<string, unknown>[]));
            stored.contents.push(...(contentRows as Record<string, unknown>[]));
        }
        return stored;
    }

    /** Decode joined rows into resources and attach each one's locale list. */
    async function decodeRows(raw: Record<string, unknown>[]): Promise<R[]> {
        if (raw.length === 0) return [];
        const split_ = raw.map(split);
        const ids = Array.from(
            new Set(split_.map(({ contentRow }) => String(contentRow[resourceIdColumn])))
        );
        const byId = await locales(ids);
        return split_.map(({ resourceRow, contentRow }) =>
            opts.decode(
                resourceRow as never,
                contentRow as never,
                byId.get(String(contentRow[resourceIdColumn])) ?? [
                    String(contentRow['locale']),
                ]
            )
        );
    }

    /**
     * Replace each resource with its read in `locale` where it has a content row
     * there; one with none keeps what it was read in. One query per chunk of
     * ids, for a page read in the default locale.
     */
    async function overlayLocale(read: R[], locale: string): Promise<R[]> {
        const byId = new Map<string, R>();
        // The locale binds one parameter beside the ids.
        for (const chunk of chunks(
            read.map((row) => row.id),
            MAX_BOUND_PARAMETERS - 1
        )) {
            const raw = await joined()
                .where((eb) =>
                    eb.and([
                        eb(`${contentKey}.${resourceIdColumn}`, 'in', chunk),
                        eb(`${contentKey}.locale`, '=', locale),
                        ...canonicalOnly(eb),
                    ])
                )
                .execute();
            for (const row of await decodeRows(raw)) byId.set(row.id, row);
        }
        return read.map((row) => byId.get(row.id) ?? row);
    }

    /**
     * A page of resources under `where`, ordered by resource-row columns, each
     * read in `locale` where it has a content row. Omit `limit` for every match.
     */
    async function findMany(params: {
        where: JoinedWhere;
        orderBy: readonly SortClause[];
        limit?: number | undefined;
        offset?: number | undefined;
        locale?: string | undefined;
    }): Promise<R[]> {
        let q = joined().where(params.where);
        for (const { field, direction } of params.orderBy) {
            q = q.orderBy(`${resourceKey}.${field}`, direction);
        }
        if (params.limit !== undefined) q = q.limit(params.limit);
        if (params.offset !== undefined) q = q.offset(params.offset);
        const read = await decodeRows(await q.execute());
        const { locale } = params;
        if (locale === undefined || locale === defaultLocale()) return read;
        return overlayLocale(read, locale);
    }

    async function one(raw: Record<string, unknown> | undefined): Promise<R | null> {
        if (!raw) return null;
        const [row] = await decodeRows([raw]);
        return row ?? null;
    }

    /** One canonical (non-staged) row of one item, encoded. */
    async function findCanonical(
        id: string,
        locale: string,
        includeTrashed: boolean
    ): Promise<Record<string, unknown> | undefined> {
        return joined()
            .where((eb) =>
                eb.and([
                    eb(`${contentKey}.${resourceIdColumn}`, '=', id),
                    eb(`${contentKey}.locale`, '=', locale),
                    ...canonicalOnly(eb),
                    ...resourceFilter(eb, { includeTrashed }),
                ])
            )
            .executeTakeFirst();
    }

    function canonicalOnly(eb: Parameters<JoinedWhere>[0]): Expression<SqlBool>[] {
        return hasStagedFor ? [eb(`${contentKey}.stagedFor`, 'is', null)] : [];
    }

    async function findOne(
        ref: ContentRef,
        options?: { includeTrashed?: boolean }
    ): Promise<R | null> {
        return one(
            await findCanonical(
                ref.id,
                ref.locale ?? defaultLocale(),
                options?.includeTrashed === true
            )
        );
    }

    async function findAnyLocale(
        id: string,
        options?: { includeTrashed?: boolean }
    ): Promise<R | null> {
        const includeTrashed = options?.includeTrashed === true;
        const preferred = await findCanonical(id, defaultLocale(), includeTrashed);
        if (preferred) return one(preferred);

        return one(
            await joined()
                .where((eb) =>
                    eb.and([
                        eb(`${contentKey}.${resourceIdColumn}`, '=', id),
                        ...canonicalOnly(eb),
                        ...resourceFilter(eb, { includeTrashed }),
                    ])
                )
                .orderBy(`${contentKey}.locale`, 'asc')
                .executeTakeFirst()
        );
    }

    async function create(
        resourceRow: Record<string, unknown>,
        content: ContentWrite
    ): Promise<R> {
        return transaction(async () => {
            const created = (await resourceRows.create(resourceRow as never)) as Record<
                string,
                unknown
            >;
            const id = String(created['id']);
            await contents.create(
                insertValues({
                    id,
                    locale: content.locale ?? defaultLocale(),
                    stagedFor: null,
                    resourceRow: created,
                    data: content,
                }) as never
            );
            return required(
                await findOne(
                    { id, locale: content.locale ?? defaultLocale() },
                    {
                        includeTrashed: true,
                    }
                ),
                id
            );
        });
    }

    /**
     * Write one locale's content row and stamp the resource row. A locale with
     * no row yet gets one, the write that makes a translation.
     */
    async function update(ref: ContentRef, data: ContentWrite): Promise<R> {
        return transaction(async () => {
            await writeCanonical(ref, data);
            await touch(ref.id, data.updatedBy);
            return required(
                await findOne(
                    { id: ref.id, locale: ref.locale ?? defaultLocale() },
                    { includeTrashed: true }
                ),
                ref.id
            );
        });
    }

    /** The content-row half of `update`: insert the locale's row, or patch it. */
    async function writeCanonical(ref: ContentRef, data: ContentWrite): Promise<void> {
        const locale = ref.locale ?? defaultLocale();
        const existing = await findCanonical(ref.id, locale, true);

        if (!existing) {
            const resourceRow = (await resourceRows.findOne({ id: ref.id })) as Record<
                string,
                unknown
            > | null;
            if (!resourceRow) throw missing(ref.id);
            await contents.create(
                insertValues({
                    id: ref.id,
                    locale,
                    stagedFor: null,
                    resourceRow,
                    data,
                }) as never
            );
        } else {
            // An explicitly-`undefined` key means "leave this column alone"
            // (`Patch` admits it and the encoder drops it), so the partial write
            // forwards straight through. The wrapper stamps the content row's
            // `updatedAt` (the column declares `onUpdate`).
            const { contentRow } = split(existing);
            await contents.update(String(contentRow['id']), patchValues(data) as never);
        }
    }

    async function del(id: string): Promise<void> {
        await resourceRows.delete(id);
    }

    /** The staged content row for one locale, encoded, or undefined. */
    async function findStaged(
        id: string,
        locale: string
    ): Promise<Record<string, unknown> | undefined> {
        if (!hasStagedFor) return undefined;
        return joined()
            .where((eb) =>
                eb.and([
                    eb(`${contentKey}.${resourceIdColumn}`, '=', id),
                    eb(`${contentKey}.locale`, '=', locale),
                    eb(`${contentKey}.stagedFor`, 'is not', null),
                    ...resourceFilter(eb, { includeTrashed: false }),
                ])
            )
            .executeTakeFirst();
    }

    // A staged write leaves the resource row alone: a staged change is not the
    // resource until the merge, which writes through `update`.
    const staging = {
        findOne: async (ref: ContentRef): Promise<R | null> => {
            return one(await findStaged(ref.id, ref.locale ?? defaultLocale()));
        },

        create: async (ref: ContentRef, data: ContentWrite): Promise<R> => {
            const locale = ref.locale ?? defaultLocale();
            const canonical = await findCanonical(ref.id, locale, false);
            if (!canonical) throw missing(ref.id);
            const { resourceRow, contentRow } = split(canonical);

            await contents.create(
                insertValues({
                    id: ref.id,
                    locale,
                    stagedFor: String(contentRow['id']),
                    resourceRow,
                    data,
                }) as never
            );
            return required(await staging.findOne({ id: ref.id, locale }), ref.id);
        },

        update: async (ref: ContentRef, data: ContentWrite): Promise<R> => {
            const locale = ref.locale ?? defaultLocale();
            const existing = await findStaged(ref.id, locale);
            if (!existing) throw noStaged(ref.id);

            const { contentRow } = split(existing);
            await contents.update(String(contentRow['id']), patchValues(data) as never);
            const updated = await staging.findOne({ id: ref.id, locale });
            if (!updated) throw noStaged(ref.id);
            return updated;
        },

        delete: async (ref: ContentRef): Promise<void> => {
            await contents.deleteMany({
                [resourceIdColumn]: ref.id,
                locale: ref.locale ?? defaultLocale(),
                stagedFor: { ne: null },
            });
        },
    };

    const translatable = {
        siblings: async (id: string, excludeLocale?: string): Promise<R[]> => {
            const raw = await joined()
                .where((eb) =>
                    eb.and([
                        eb(`${contentKey}.${resourceIdColumn}`, '=', id),
                        ...canonicalOnly(eb),
                        ...resourceFilter(eb, { includeTrashed: false }),
                        ...(excludeLocale === undefined
                            ? []
                            : [eb(`${contentKey}.locale`, '!=', excludeLocale)]),
                    ])
                )
                .execute();
            return decodeRows(raw);
        },

        propagateFields: async (
            id: string,
            excludeLocale: string,
            values: JsonObject
        ): Promise<void> => {
            const siblings = await contents.findMany({
                where: {
                    [resourceIdColumn]: id,
                    locale: { ne: excludeLocale },
                    ...(hasStagedFor ? { stagedFor: null } : {}),
                },
            });

            if (siblings.length === 0) return;

            await transaction(async () => {
                for (const sibling of siblings) {
                    // Rows come back decoded, so `fields` is already the parsed object.
                    const row = sibling as Record<string, unknown>;
                    const existingFields = (row['fields'] ?? {}) as JsonObject;
                    await contents.update(String(row['id']), {
                        fields: { ...existingFields, ...values },
                    } as never);
                }
                await touch(id);
            });
        },
    };

    function missing(id: string): AstromechError {
        return new AstromechError(`${shape.table.name} row '${id}' not found`);
    }

    function noStaged(id: string): AstromechError {
        return new AstromechError(`No staged change for ${shape.table.name} row '${id}'`);
    }

    function required(row: R | null, id: string): R {
        if (!row) throw missing(id);
        return row;
    }

    return {
        findOne,
        findAnyLocale,
        findMany,
        count,
        create,
        update,
        delete: del,
        locales,
        findStoredRows,
        decodeRows,
        overlayLocale,
        translatable,
        staging,
        versions: versionsRepository,
        kysely: () => ({ db: db(), resourceKey, contentKey, joined }),
    };
}

/**
 * The `updatedAt` and `updatedBy` a resource read reports: the resource row's,
 * or for a staged read its own content row's, since staging never stamps the
 * resource row. Each resource's `decode` spreads it.
 */
export function lastUpdate(
    resourceRow: { updatedAt: Date; updatedBy: string | null },
    contentRow: { stagedFor: string | null; updatedAt: Date; updatedBy: string | null }
): Pick<Resource, 'updatedAt' | 'updatedBy'> {
    const source = contentRow.stagedFor === null ? resourceRow : contentRow;
    return { updatedAt: source.updatedAt, updatedBy: source.updatedBy };
}
