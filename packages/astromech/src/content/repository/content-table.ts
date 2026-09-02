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
    ContentRow,
    ContentShape,
    ContentWrite,
    JoinedQuery,
    JoinedWhere,
    OwnerFilter,
} from './types';
import type { Table } from '@/database/define-table';
import type { GenericDb } from '@/database/repository/create-repository';
import type { JsonObject } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
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
const OWNER_PREFIX = 'owner';

function ownerAlias(column: string): string {
    return `${OWNER_PREFIX}${column.charAt(0).toUpperCase()}${column.slice(1)}`;
}

/** The write keys that are not content columns and never reach a row patch. */
const NON_COLUMN_KEYS = new Set(['locale']);

export function createContentRepository<
    R extends ContentRow,
    O extends Table,
    C extends Table,
    V extends Table,
>(
    shape: ContentShape<O, C, V>,
    opts: ContentRepositoryOptions<R, O, C>
): ContentRepository<R, V> {
    const dbOverride = opts.db;
    const defaultLocale = opts.defaultLocale ?? 'en';
    const { ownerColumn } = shape;
    const inheritedColumns = shape.inheritedColumns ?? [];
    const ownerKey = kyselyTableKey(shape.table.name);
    const contentKey = kyselyTableKey(shape.contentTable.name);
    const ownerColumns = Object.keys(shape.table.columns);
    const contentColumns = Object.keys(shape.contentTable.columns);
    const hasStagedFor = contentColumns.includes('stagedFor');
    const ownerFilter: OwnerFilter = opts.ownerFilter ?? (() => []);

    // Unbound when there is no override, so they follow `setDb` per call exactly
    // as `handle()` does.
    const owners = createRepository(shape.table, dbOverride);
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
     * A content-row INSERT: the write's own columns, the owner row's inherited
     * ones, and the defaults for whatever is still missing.
     */
    function insertValues(params: {
        id: string;
        locale: string;
        stagedFor: string | null;
        own: Record<string, unknown>;
        data: ContentWrite;
    }): Record<string, unknown> {
        const values: Record<string, unknown> = {
            [ownerColumn]: params.id,
            locale: params.locale,
            createdBy: params.data.createdBy ?? null,
            updatedBy: params.data.updatedBy ?? null,
        };
        if (hasStagedFor) values['stagedFor'] = params.stagedFor;
        for (const column of inheritedColumns) values[column] = params.own[column];
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

    /** `SELECT` over the join, every content column plus every aliased owner one. */
    function joined(): JoinedQuery {
        let query = db()
            .selectFrom(contentKey)
            .innerJoin(ownerKey, `${ownerKey}.id`, `${contentKey}.${ownerColumn}`)
            .selectAll(contentKey);
        for (const column of ownerColumns) {
            query = query.select(
                `${ownerKey}.${column} as ${ownerAlias(column)}` as never
            );
        }
        return query as unknown as JoinedQuery;
    }

    async function count(where: JoinedWhere): Promise<number> {
        const row = await db()
            .selectFrom(contentKey)
            .innerJoin(ownerKey, `${ownerKey}.id`, `${contentKey}.${ownerColumn}`)
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where(where)
            .executeTakeFirst();
        return Number(row?.c ?? 0);
    }

    /** Split a joined record back into the two rows and decode each. */
    function split(row: Record<string, unknown>): {
        own: Record<string, unknown>;
        content: Record<string, unknown>;
    } {
        const own: Record<string, unknown> = {};
        for (const column of ownerColumns) own[column] = row[ownerAlias(column)];
        const content: Record<string, unknown> = {};
        for (const column of contentColumns) content[column] = row[column];
        return {
            own: decodeWith(shape.table, own),
            content: decodeWith(shape.contentTable, content),
        };
    }

    /**
     * One grouped `SELECT <ownerColumn>, locale FROM <content>` over the page,
     * so a list of N rows costs one extra query rather than N.
     */
    async function locales(ids: string[]): Promise<Map<string, string[]>> {
        const byId = new Map<string, string[]>();
        if (ids.length === 0) return byId;

        const rows = await contents.findMany({
            where: {
                [ownerColumn]: { in: ids },
                ...(hasStagedFor ? { stagedFor: null } : {}),
            },
        });
        for (const row of rows) {
            const key = String((row as Record<string, unknown>)[ownerColumn]);
            const found = byId.get(key);
            if (found) found.push(String(row.locale));
            else byId.set(key, [String(row.locale)]);
        }
        for (const list of byId.values()) list.sort();
        return byId;
    }

    /** Decode joined rows and attach each one's locale list. */
    async function rows(raw: Record<string, unknown>[]): Promise<R[]> {
        if (raw.length === 0) return [];
        const split_ = raw.map(split);
        const ids = Array.from(
            new Set(split_.map(({ content }) => String(content[ownerColumn])))
        );
        const byId = await locales(ids);
        return split_.map(({ own, content }) =>
            opts.decode(
                own as never,
                content as never,
                byId.get(String(content[ownerColumn])) ?? [String(content['locale'])]
            )
        );
    }

    async function one(raw: Record<string, unknown> | undefined): Promise<R | null> {
        if (!raw) return null;
        const [row] = await rows([raw]);
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
                    eb(`${contentKey}.${ownerColumn}`, '=', id),
                    eb(`${contentKey}.locale`, '=', locale),
                    ...canonicalOnly(eb),
                    ...ownerFilter(eb, { includeTrashed }),
                ])
            )
            .executeTakeFirst();
    }

    function canonicalOnly(eb: Parameters<JoinedWhere>[0]): Expression<SqlBool>[] {
        return hasStagedFor ? [eb(`${contentKey}.stagedFor`, 'is', null)] : [];
    }

    async function get(
        ref: ContentRef,
        options?: { includeTrashed?: boolean }
    ): Promise<R | null> {
        return one(
            await findCanonical(
                ref.id,
                ref.locale ?? defaultLocale,
                options?.includeTrashed === true
            )
        );
    }

    async function anyLocale(
        id: string,
        options?: { includeTrashed?: boolean }
    ): Promise<R | null> {
        const includeTrashed = options?.includeTrashed === true;
        const preferred = await findCanonical(id, defaultLocale, includeTrashed);
        if (preferred) return one(preferred);

        return one(
            await joined()
                .where((eb) =>
                    eb.and([
                        eb(`${contentKey}.${ownerColumn}`, '=', id),
                        ...canonicalOnly(eb),
                        ...ownerFilter(eb, { includeTrashed }),
                    ])
                )
                .orderBy(`${contentKey}.locale`, 'asc')
                .executeTakeFirst()
        );
    }

    async function create(
        own: Record<string, unknown>,
        content: ContentWrite
    ): Promise<R> {
        return transaction(async () => {
            const ownRow = (await owners.create(own as never)) as Record<string, unknown>;
            const id = String(ownRow['id']);
            await contents.create(
                insertValues({
                    id,
                    locale: content.locale ?? defaultLocale,
                    stagedFor: null,
                    own: ownRow,
                    data: content,
                }) as never
            );
            return required(
                await get(
                    { id, locale: content.locale ?? defaultLocale },
                    {
                        includeTrashed: true,
                    }
                ),
                id
            );
        });
    }

    /**
     * Write one locale's content row. A locale with no row yet gets one — the
     * write that makes a translation. Nothing on the resource row changes: it
     * carries no per-locale content.
     */
    async function update(ref: ContentRef, data: ContentWrite): Promise<R> {
        const locale = ref.locale ?? defaultLocale;
        const existing = await findCanonical(ref.id, locale, true);

        if (!existing) {
            const ownRow = (await owners.findOne({ id: ref.id } as never)) as Record<
                string,
                unknown
            > | null;
            if (!ownRow) throw missing(ref.id);
            await contents.create(
                insertValues({
                    id: ref.id,
                    locale,
                    stagedFor: null,
                    own: ownRow,
                    data,
                }) as never
            );
        } else {
            // An explicitly-`undefined` key means "leave this column alone"
            // (`Patch` admits it and the encoder drops it), so the partial write
            // forwards straight through. `updatedAt` is stamped by the wrapper
            // (the column declares `onUpdate`).
            const { content } = split(existing);
            await contents.update(String(content['id']), patchValues(data) as never);
        }

        return required(
            await get({ id: ref.id, locale }, { includeTrashed: true }),
            ref.id
        );
    }

    async function del(id: string): Promise<void> {
        await owners.delete(id);
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
                    eb(`${contentKey}.${ownerColumn}`, '=', id),
                    eb(`${contentKey}.locale`, '=', locale),
                    eb(`${contentKey}.stagedFor`, 'is not', null),
                    ...ownerFilter(eb, { includeTrashed: false }),
                ])
            )
            .executeTakeFirst();
    }

    const staging = {
        getByCanonical: async (id: string, locale?: string): Promise<R | null> => {
            return one(await findStaged(id, locale ?? defaultLocale));
        },

        create: async (ref: ContentRef, data: ContentWrite): Promise<R> => {
            const locale = ref.locale ?? defaultLocale;
            const canonical = await findCanonical(ref.id, locale, false);
            if (!canonical) throw missing(ref.id);
            const { own, content } = split(canonical);

            await contents.create(
                insertValues({
                    id: ref.id,
                    locale,
                    stagedFor: String(content['id']),
                    own,
                    data,
                }) as never
            );
            return required(await staging.getByCanonical(ref.id, locale), ref.id);
        },

        update: async (ref: ContentRef, data: ContentWrite): Promise<R> => {
            const locale = ref.locale ?? defaultLocale;
            const existing = await findStaged(ref.id, locale);
            if (!existing) throw noStaged(ref.id);

            const { content } = split(existing);
            await contents.update(String(content['id']), patchValues(data) as never);
            const updated = await staging.getByCanonical(ref.id, locale);
            if (!updated) throw noStaged(ref.id);
            return updated;
        },

        delete: async (ref: ContentRef): Promise<void> => {
            await contents.deleteMany({
                [ownerColumn]: ref.id,
                locale: ref.locale ?? defaultLocale,
                stagedFor: { ne: null },
            } as never);
        },
    };

    const translatable = {
        siblings: async (id: string, excludeLocale?: string): Promise<R[]> => {
            const raw = await joined()
                .where((eb) =>
                    eb.and([
                        eb(`${contentKey}.${ownerColumn}`, '=', id),
                        ...canonicalOnly(eb),
                        ...ownerFilter(eb, { includeTrashed: false }),
                        ...(excludeLocale === undefined
                            ? []
                            : [eb(`${contentKey}.locale`, '!=', excludeLocale)]),
                    ])
                )
                .execute();
            return rows(raw);
        },

        propagateFields: async (
            id: string,
            excludeLocale: string,
            values: JsonObject
        ): Promise<void> => {
            const siblings = await contents.findMany({
                where: {
                    [ownerColumn]: id,
                    locale: { ne: excludeLocale },
                    ...(hasStagedFor ? { stagedFor: null } : {}),
                } as never,
            });

            for (const sibling of siblings) {
                // Rows come back decoded, so `fields` is already the parsed object.
                const row = sibling as Record<string, unknown>;
                const existingFields = (row['fields'] ?? {}) as JsonObject;
                await contents.update(String(row['id']), {
                    fields: { ...existingFields, ...values },
                } as never);
            }
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
        get,
        anyLocale,
        create,
        update,
        delete: del,
        locales,
        translatable,
        staging,
        versions: versionsRepository,
        query: { db, ownerKey, contentKey, joined, count, rows },
    };
}
