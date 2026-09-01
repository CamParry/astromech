/**
 * The default entry repository — persistence over `entries` joined to
 * `entry_content`. Owns row CRUD, list filters, slug uniquification and the
 * capability groups; policy (validation, hooks, relationships) stays in the service.
 */

import type {
    Capability,
    ContentRowId,
    EntryRef,
    EntryRepository,
    EntryRow,
    EntryWrite,
    ListParams,
    NewEntryVersionSnapshot,
    PreviewTokenRecord,
} from './types';
import type { DB, Db } from '@/database/types';
import type {
    EntryRow as EntriesTableRow,
    EntryContentRow,
    EntryVersionRow,
} from '@/entries/tables';
import type {
    EntryStatus,
    JsonObject,
    ReferencesFilter,
    SortOption,
} from '@/types/index';
import type { ExpressionBuilder, Updateable } from 'kysely';
import { decodeWith, encodePatchWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { existingResourceIds } from '@/database/repository/resource-existence';
import { entriesTable, entryContentTable } from '@/database/tables';
import { transaction } from '@/database/transaction';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { UnknownSortKeyError, UnknownWhereKeyError } from '../errors';
import { createVersionRepository } from './versions';

const SORTABLE_FIELDS: readonly string[] = [
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'slug',
];

/** Joined tables the list/read queries address. */
type JoinedTables = 'entryContent' | 'entries';

type OrderPair = [column: string, direction: 'asc' | 'desc'];

/** A content row plus the two `entries` columns the entry shape reads. */
type JoinedRow = EntryContentRow & {
    entryDeletedAt: Date | null;
    entryCreatedAt: Date;
};

/**
 * `createdAt` is the entry's, every other sortable column the content row's —
 * the same split the returned shape makes.
 */
function buildOrderBy(sort?: SortOption | SortOption[]): OrderPair[] {
    const fallback: OrderPair[] = [['entries.createdAt', 'desc']];
    if (!sort) return fallback;

    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses: OrderPair[] = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!SORTABLE_FIELDS.includes(field)) {
                throw new UnknownSortKeyError(field, SORTABLE_FIELDS);
            }
            const column =
                field === 'createdAt' ? 'entries.createdAt' : `entryContent.${field}`;
            return [[column, dir === 'asc' ? 'asc' : 'desc']] as OrderPair[];
        })
    );

    return clauses.length > 0 ? clauses : fallback;
}

function buildListWhere(params: ListParams, defaultLocale: string, types: string[]) {
    return (eb: ExpressionBuilder<DB, JoinedTables>) => {
        const conditions = [];

        // type condition
        const [firstType] = types;
        if (types.length === 1 && firstType !== undefined) {
            conditions.push(eb('entryContent.type', '=', firstType));
        } else {
            conditions.push(eb('entryContent.type', 'in', types));
        }

        // Staged rows (forward versioning) are never canonical content
        conditions.push(eb('entryContent.stagedFor', 'is', null));

        // trash filter — resource-level, so it reads the entry row
        const trashed = params.trashed ?? false;
        if (trashed) {
            conditions.push(eb('entries.deletedAt', 'is not', null));
        } else {
            conditions.push(eb('entries.deletedAt', 'is', null));
        }

        // locale condition
        const localeVal = params.locale;
        if (localeVal !== 'all') {
            conditions.push(eb('entryContent.locale', '=', localeVal ?? defaultLocale));
        }

        // search
        if (params.search) {
            const term = `%${params.search}%`;
            conditions.push(
                eb.or([
                    eb('entryContent.title', 'like', term),
                    eb('entryContent.slug', 'like', term),
                ])
            );
        }

        // where filters. Column comparisons follow the shared `where` DSL
        // (database/repository/create-repository.ts): `undefined` or an absent key means
        // unfiltered, a deliberate `null` renders `IS NULL`. Reading a bare `null`
        // as unfiltered instead returned every row to a caller asking for the
        // null ones.
        if (params.where) {
            for (const [key, value] of Object.entries(params.where)) {
                if (value === undefined) continue;
                if (key === 'locale') continue; // handled above

                if (key === '_search') {
                    // Not a column: a LIKE against null says nothing, so only a
                    // term filters.
                    if (typeof value === 'string') {
                        conditions.push(eb('entryContent.title', 'like', `%${value}%`));
                    }
                } else if (key === 'status') {
                    if (Array.isArray(value)) {
                        conditions.push(
                            eb('entryContent.status', 'in', value as EntryStatus[])
                        );
                    } else if (value === null) {
                        conditions.push(eb('entryContent.status', 'is', null));
                    } else {
                        conditions.push(
                            eb('entryContent.status', '=', value as EntryStatus)
                        );
                    }
                } else if (key === 'slug') {
                    conditions.push(
                        value === null
                            ? eb('entryContent.slug', 'is', null)
                            : eb('entryContent.slug', '=', value as string)
                    );
                } else if (key === 'title') {
                    conditions.push(
                        value === null
                            ? eb('entryContent.title', 'is', null)
                            : eb('entryContent.title', '=', value as string)
                    );
                } else if (key === 'id') {
                    const inClause =
                        value === null ? undefined : (value as { in?: unknown }).in;
                    if (Array.isArray(inClause)) {
                        conditions.push(eb('entries.id', 'in', inClause as string[]));
                    } else if (value === null) {
                        conditions.push(eb('entries.id', 'is', null));
                    } else {
                        conditions.push(eb('entries.id', '=', value as string));
                    }
                } else if (key === 'references') {
                    // Shape guard only: `entries.query` validates the filter and
                    // its schema path and throws before the repository sees a
                    // malformed one, so there is nothing to report from here.
                    if (!isReferencesFilter(value)) continue;
                    conditions.push(referencesExists(eb, value));
                } else {
                    throw new UnknownWhereKeyError(key);
                }
            }
        }

        return eb.and(conditions);
    };
}

/**
 * `EXISTS` against the relationships index for one entry.
 *
 * `relationships.sourceId` is an entry id, so this correlates on `entries.id`.
 * No `targetKind` condition — a target id is a ULID unique across resources,
 * and constraining it would force the caller to say which kind they meant.
 * `schemaPath`/`targetId` are plain TEXT and `sourceKind` is an enum the table
 * passes through, so all three bind as-is with no `encodeWith`.
 */
function referencesExists(
    eb: ExpressionBuilder<DB, JoinedTables>,
    filter: ReferencesFilter
) {
    return eb.exists(
        eb
            .selectFrom('relationships')
            .select('relationships.sourceId')
            .whereRef('relationships.sourceId', '=', 'entries.id')
            .where('relationships.sourceKind', '=', 'entry')
            .where('relationships.schemaPath', '=', filter.path)
            .where('relationships.targetId', '=', filter.id)
    );
}

/** A `references` value carrying both strings; anything else filters nothing. */
function isReferencesFilter(value: unknown): value is ReferencesFilter {
    if (typeof value !== 'object' || value === null) return false;
    const { path, id } = value as Partial<ReferencesFilter>;
    return typeof path === 'string' && path !== '' && typeof id === 'string' && id !== '';
}

/** The content row plus the aliased `entries` columns, all decoded. */
function decodeJoined(row: Record<string, unknown>): JoinedRow {
    const content = decodeWith(entryContentTable, row);
    const deletedAt = row['entryDeletedAt'];
    const createdAt = row['entryCreatedAt'];
    return {
        ...content,
        entryDeletedAt:
            deletedAt === null || deletedAt === undefined
                ? null
                : (entriesTable.columns.deletedAt.parse(deletedAt) as Date),
        entryCreatedAt: entriesTable.columns.createdAt.parse(createdAt) as Date,
    };
}

/** One joined row plus its locale list, in the shape the service reads. */
function toEntryRow(row: JoinedRow, locales: string[]): EntryRow {
    return {
        id: row.entryId,
        contentId: row.id as ContentRowId,
        type: row.type,
        locale: row.locale,
        locales,
        staged: row.stagedFor !== null,
        title: row.title,
        slug: row.slug,
        fields: (row.fields ?? {}) as JsonObject,
        status: row.status,
        publishedAt: row.publishedAt,
        deletedAt: row.entryDeletedAt,
        createdAt: row.entryCreatedAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
    };
}

/**
 * One grouped `SELECT entry_id, locale FROM entry_content` over the page, so a
 * list of N rows costs one extra query rather than N.
 */
async function populateLocales(db: Db, rows: JoinedRow[]): Promise<EntryRow[]> {
    if (rows.length === 0) return [];

    const entryIds = Array.from(new Set(rows.map((row) => row.entryId)));
    const siblings = await db
        .selectFrom('entryContent')
        .select(['entryId', 'locale'])
        .where((eb) =>
            eb.and([eb('entryId', 'in', entryIds), eb('stagedFor', 'is', null)])
        )
        .execute();

    const byEntry = new Map<string, string[]>();
    for (const sibling of siblings) {
        const locales = byEntry.get(sibling.entryId);
        if (locales) locales.push(sibling.locale);
        else byEntry.set(sibling.entryId, [sibling.locale]);
    }
    for (const locales of byEntry.values()) locales.sort();

    return rows.map((row) => toEntryRow(row, byEntry.get(row.entryId) ?? [row.locale]));
}

async function populateLocaleSingle(db: Db, row: JoinedRow): Promise<EntryRow> {
    const [populated] = await populateLocales(db, [row]);
    if (!populated) throw new Error('Failed to populate entry');
    return populated;
}

/**
 * Build the entries-table repository, optionally bound to a specific db handle
 * and default locale. Unbound it resolves the db per operation via `getDb()`.
 */
export function createEntriesTableRepository(opts?: { db?: Db; defaultLocale?: string }) {
    const dbOverride = opts?.db;
    const defaultLocale = opts?.defaultLocale ?? 'en';

    const handle = (): Db => dbOverride ?? getDb();

    // Unbound when there is no override, so they follow `setDb` per call exactly
    // as `handle()` does.
    const entries = createRepository(entriesTable, dbOverride);
    const contents = createRepository(entryContentTable, dbOverride);

    const supports: readonly Capability[] = ALL_CAPABILITIES;

    /** The content row read joined to the two `entries` columns it needs. */
    function joinedQuery(db: Db) {
        return db
            .selectFrom('entryContent')
            .innerJoin('entries', 'entries.id', 'entryContent.entryId')
            .selectAll('entryContent')
            .select([
                'entries.deletedAt as entryDeletedAt',
                'entries.createdAt as entryCreatedAt',
            ]);
    }

    /** One canonical (non-staged) content row, or null. */
    async function findCanonical(
        id: string,
        locale: string,
        includeTrashed: boolean
    ): Promise<JoinedRow | null> {
        const row = await joinedQuery(handle())
            .where((eb) =>
                eb.and([
                    eb('entryContent.entryId', '=', id),
                    eb('entryContent.locale', '=', locale),
                    eb('entryContent.stagedFor', 'is', null),
                    ...(includeTrashed ? [] : [eb('entries.deletedAt', 'is', null)]),
                ])
            )
            .executeTakeFirst();
        return row ? decodeJoined(row) : null;
    }

    /** Ids with a row in `entries` — trashed entries included. */
    async function existingIds(ids: string[]): Promise<Set<string>> {
        return existingResourceIds('entry', ids, handle());
    }

    async function uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string> {
        let candidate = baseSlug;
        let counter = 1;

        while (true) {
            // Raw: a join, because the slug of a trashed entry is free again and
            // `deletedAt` now lives on the entry row.
            const existing = await handle()
                .selectFrom('entryContent')
                .innerJoin('entries', 'entries.id', 'entryContent.entryId')
                .select('entryContent.id')
                .where((eb) =>
                    eb.and([
                        eb('entryContent.type', '=', type),
                        eb('entryContent.locale', '=', locale),
                        eb('entryContent.slug', '=', candidate),
                        // Staged rows legitimately share their canonical's slug;
                        // they are outside the partial unique index, so they are
                        // not a collision.
                        eb('entryContent.stagedFor', 'is', null),
                        eb('entries.deletedAt', 'is', null),
                        ...(excludeId === undefined
                            ? []
                            : [eb('entryContent.entryId', '!=', excludeId)]),
                    ])
                )
                .limit(1)
                .executeTakeFirst();

            if (!existing) return candidate;

            counter++;
            candidate = `${baseSlug}-${counter}`;
        }
    }

    async function list(
        params: ListParams
    ): Promise<{ data: EntryRow[]; total: number }> {
        const db = handle();
        const typeParam = params.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : [typeParam as string];
        const limit = params.limit;
        const page = params.page ?? 1;

        const orderPairs = buildOrderBy(params.sort);
        // Raw: search is `title LIKE ? OR slug LIKE ?` and the flat `where` DSL has
        // no `or`. Rows and count share this predicate so the two cannot drift.
        const whereFn = buildListWhere(params, defaultLocale, types);

        if (limit === 'all') {
            let q = joinedQuery(db).where(whereFn);
            for (const [column, direction] of orderPairs) {
                q = q.orderBy(column as never, direction);
            }
            const data = await populateLocales(db, (await q.execute()).map(decodeJoined));
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const cr = await db
            .selectFrom('entryContent')
            .innerJoin('entries', 'entries.id', 'entryContent.entryId')
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where(whereFn)
            .executeTakeFirst();
        const total = Number(cr?.c ?? 0);

        let rowsQ = joinedQuery(db).where(whereFn).limit(perPage).offset(offset);
        for (const [column, direction] of orderPairs) {
            rowsQ = rowsQ.orderBy(column as never, direction);
        }
        const data = await populateLocales(db, (await rowsQ.execute()).map(decodeJoined));
        return { data, total };
    }

    async function get(
        ref: EntryRef,
        opts?: { includeTrashed?: boolean }
    ): Promise<EntryRow | null> {
        const row = await findCanonical(
            ref.id,
            ref.locale ?? defaultLocale,
            opts?.includeTrashed === true
        );
        if (!row) return null;
        return populateLocaleSingle(handle(), row);
    }

    async function create(data: EntryWrite & { type: string }): Promise<EntryRow> {
        return transaction(async () => {
            const entry = await entries.create({
                type: data.type,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            });
            const content = await contents.create({
                entryId: entry.id,
                type: data.type,
                locale: data.locale ?? defaultLocale,
                title: data.title ?? '',
                slug: data.slug ?? null,
                fields: data.fields ?? {},
                status: data.status ?? 'unpublished',
                publishedAt: data.publishedAt ?? null,
                stagedFor: null,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            });
            return populateLocaleSingle(handle(), joinOf(entry, content));
        });
    }

    /**
     * Write one locale's content row. A locale with no row yet gets one — the
     * write that makes a translation. Nothing on the `entries` row changes: it
     * carries no per-locale content.
     */
    async function update(ref: EntryRef, data: EntryWrite): Promise<EntryRow> {
        const locale = ref.locale ?? defaultLocale;
        const existing = await findCanonical(ref.id, locale, true);

        if (!existing) {
            const entry = await entries.findOne({ id: ref.id });
            if (!entry) throw new Error(`Entry '${ref.id}' not found`);
            const content = await contents.create({
                entryId: entry.id,
                type: entry.type,
                locale,
                title: data.title ?? '',
                slug: data.slug ?? null,
                fields: data.fields ?? {},
                status: data.status ?? 'unpublished',
                publishedAt: data.publishedAt ?? null,
                stagedFor: null,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            });
            return populateLocaleSingle(handle(), joinOf(entry, content));
        }

        // An explicitly-`undefined` key means "leave this column alone" (`Patch`
        // admits it and the encoder drops it), so the partial write forwards
        // straight through. `updatedAt` is stamped by the wrapper (the column
        // declares `onUpdate`).
        await contents.update(existing.id, {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
            updatedBy: data.updatedBy,
        });

        const updated = await findCanonical(ref.id, locale, true);
        if (!updated) throw new Error(`Entry '${ref.id}' not found`);
        return populateLocaleSingle(handle(), updated);
    }

    async function del(id: string): Promise<void> {
        await entries.delete(id);
    }

    const trash = {
        trash: async (id: string): Promise<void> => {
            const row = await entries.findOne({ id });
            if (!row) throw new Error(`Entry '${id}' not found`);

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt === null) {
                await entries.update(id, { deletedAt: new Date() });
            }
        },

        restore: async (id: string): Promise<EntryRow> => {
            const db = handle();
            // Guarded *and* returning: not expressible through the wrapper's
            // primary-key `update` / count-returning `updateMany`.
            await db
                .updateTable('entries')
                .set(
                    encodePatchWith(entriesTable, {
                        deletedAt: null,
                        updatedAt: new Date(),
                    }) as unknown as Updateable<DB['entries']>
                )
                .where((eb) =>
                    eb.and([eb('id', '=', id), eb('deletedAt', 'is not', null)])
                )
                .executeTakeFirstOrThrow();

            const restored = await findCanonical(id, defaultLocale, false);
            if (!restored) throw new Error(`Entry '${id}' not found`);
            return populateLocaleSingle(db, restored);
        },

        emptyTrash: async (type: string): Promise<void> => {
            await entries.deleteMany({ type, deletedAt: { ne: null } });
        },
    };

    const versions = {
        list: async (contentId: ContentRowId): Promise<EntryVersionRow[]> => {
            return createVersionRepository(handle()).list(contentId);
        },

        get: async (versionId: string): Promise<EntryVersionRow | null> => {
            return createVersionRepository(handle()).get(versionId);
        },

        create: async (snapshot: NewEntryVersionSnapshot): Promise<void> => {
            await createVersionRepository(handle()).create({
                contentId: snapshot.contentId,
                version: snapshot.version,
                title: snapshot.title,
                slug: snapshot.slug,
                fields: snapshot.fields,
                createdBy: snapshot.createdBy,
            });
        },

        latestNumber: async (contentId: ContentRowId): Promise<number> => {
            return createVersionRepository(handle()).getLatestNumber(contentId);
        },
    };

    /** The staged content row for one locale, or null. */
    async function findStaged(id: string, locale: string): Promise<JoinedRow | null> {
        const row = await joinedQuery(handle())
            .where((eb) =>
                eb.and([
                    eb('entryContent.entryId', '=', id),
                    eb('entryContent.locale', '=', locale),
                    eb('entryContent.stagedFor', 'is not', null),
                    eb('entries.deletedAt', 'is', null),
                ])
            )
            .executeTakeFirst();
        return row ? decodeJoined(row) : null;
    }

    const staging = {
        getByCanonical: async (id: string, locale?: string): Promise<EntryRow | null> => {
            const row = await findStaged(id, locale ?? defaultLocale);
            if (!row) return null;
            return populateLocaleSingle(handle(), row);
        },

        create: async (ref: EntryRef, data: EntryWrite): Promise<EntryRow> => {
            const locale = ref.locale ?? defaultLocale;
            const canonical = await findCanonical(ref.id, locale, false);
            if (!canonical) throw new Error(`Entry '${ref.id}' not found`);

            const content = await contents.create({
                entryId: ref.id,
                type: canonical.type,
                locale,
                title: data.title ?? '',
                slug: data.slug ?? null,
                fields: data.fields ?? {},
                status: data.status ?? 'unpublished',
                publishedAt: data.publishedAt ?? null,
                stagedFor: canonical.id,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            });
            const staged = await findStaged(ref.id, locale);
            if (!staged) throw new Error(`Staged row '${content.id}' not found`);
            return populateLocaleSingle(handle(), staged);
        },

        delete: async (ref: EntryRef): Promise<void> => {
            await contents.deleteMany({
                entryId: ref.id,
                locale: ref.locale ?? defaultLocale,
                stagedFor: { ne: null },
            });
        },
    };

    const translatable = {
        siblings: async (id: string, excludeLocale?: string): Promise<EntryRow[]> => {
            const rows = await joinedQuery(handle())
                .where((eb) =>
                    eb.and([
                        eb('entryContent.entryId', '=', id),
                        eb('entryContent.stagedFor', 'is', null),
                        eb('entries.deletedAt', 'is', null),
                        ...(excludeLocale === undefined
                            ? []
                            : [eb('entryContent.locale', '!=', excludeLocale)]),
                    ])
                )
                .execute();
            return populateLocales(handle(), rows.map(decodeJoined));
        },

        propagateFields: async (
            id: string,
            excludeLocale: string,
            values: JsonObject
        ): Promise<void> => {
            const siblings = await contents.findMany({
                where: {
                    entryId: id,
                    locale: { ne: excludeLocale },
                    stagedFor: null,
                },
            });

            for (const sibling of siblings) {
                // Rows come back decoded, so `fields` is already the parsed object.
                const existingFields = (sibling.fields ?? {}) as JsonObject;
                await contents.update(sibling.id, {
                    fields: { ...existingFields, ...values },
                });
            }
        },
    };

    const previewToken = {
        set: async (id: string, hash: string, expiresAt: Date | null): Promise<void> => {
            await entries.update(id, {
                previewToken: hash,
                previewTokenExpiresAt: expiresAt,
            });
        },

        clear: async (id: string): Promise<void> => {
            await entries.update(id, {
                previewToken: null,
                previewTokenExpiresAt: null,
            });
        },

        findByHash: async (hash: string): Promise<PreviewTokenRecord | null> => {
            const row = await entries.findOne({ previewToken: hash });
            if (!row) return null;
            return { id: row.id, expiresAt: row.previewTokenExpiresAt };
        },
    };

    return {
        supports,
        existingIds,
        uniqueSlug,
        list,
        get,
        create,
        update,
        delete: del,
        trash,
        versions,
        staging,
        translatable,
        previewToken,
    } satisfies EntryRepository<EntryRow>;
}

/** The two rows a fresh write already holds, in the joined read shape. */
function joinOf(entry: EntriesTableRow, content: EntryContentRow): JoinedRow {
    return {
        ...content,
        entryDeletedAt: entry.deletedAt,
        entryCreatedAt: entry.createdAt,
    };
}
