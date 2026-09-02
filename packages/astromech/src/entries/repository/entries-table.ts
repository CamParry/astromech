/**
 * The default entry repository — the shared content repository over
 * `entries`/`entry_content`/`entry_versions`, plus what only entries have: the
 * list query and its filters, slug uniquification, trash and preview tokens.
 * Policy (validation, hooks, relationships) stays in the service.
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
import type { JoinedWhere } from '@/content/repository/types';
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
import type { Expression, SqlBool, Updateable } from 'kysely';
import { createContentRepository } from '@/content/repository/content-table';
import { encodePatchWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { existingResourceIds } from '@/database/repository/resource-existence';
import { entriesTable, entryContentTable, entryVersionsTable } from '@/database/tables';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { EntryNotFoundError, UnknownSortKeyError, UnknownWhereKeyError } from '../errors';

const SORTABLE_FIELDS: readonly string[] = [
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'slug',
];

/** The expression builder the joined list query is compiled against. */
type JoinedEb = Parameters<JoinedWhere>[0];

type OrderPair = [column: string, direction: 'asc' | 'desc'];

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

function buildListWhere(
    params: ListParams,
    defaultLocale: string,
    types: string[]
): JoinedWhere {
    return (eb: JoinedEb) => {
        const conditions: Expression<SqlBool>[] = [];

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
function referencesExists(eb: JoinedEb, filter: ReferencesFilter): Expression<SqlBool> {
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

/** The two joined rows plus the locale list, in the shape the service reads. */
function toEntryRow(
    entry: EntriesTableRow,
    content: EntryContentRow,
    locales: string[]
): EntryRow {
    return {
        id: content.entryId,
        contentId: content.id as ContentRowId,
        type: content.type,
        locale: content.locale,
        locales,
        staged: content.stagedFor !== null,
        title: content.title,
        slug: content.slug,
        fields: (content.fields ?? {}) as JsonObject,
        status: content.status,
        publishedAt: content.publishedAt,
        deletedAt: entry.deletedAt,
        createdAt: entry.createdAt,
        updatedAt: content.updatedAt,
        createdBy: content.createdBy,
        updatedBy: content.updatedBy,
    };
}

/**
 * Build the entries-table repository, optionally bound to a specific db handle
 * and default locale. Unbound it resolves the db per operation via `getDb()`.
 */
export function createEntriesTableRepository(opts?: { db?: Db; defaultLocale?: string }) {
    const dbOverride = opts?.db;
    const defaultLocale = opts?.defaultLocale ?? 'en';

    const handle = (): Db => dbOverride ?? getDb();

    // Unbound when there is no override, so it follows `setDb` per call exactly
    // as `handle()` does.
    const entries = createRepository(entriesTable, dbOverride);

    const content = createContentRepository(
        {
            table: entriesTable,
            contentTable: entryContentTable,
            versionsTable: entryVersionsTable,
            ownerColumn: 'entryId',
            // `entry_content.type` is copied from `entries.type`: the slug-unique
            // and list indexes cannot reach across the join.
            inheritedColumns: ['type'],
            insertDefaults: { title: '', slug: null },
        },
        {
            ...(dbOverride ? { db: dbOverride } : {}),
            defaultLocale,
            decode: toEntryRow,
            // Trash is resource-level, so it filters on the entry row.
            ownerFilter: (eb, options) =>
                options.includeTrashed === true
                    ? []
                    : [eb('entries.deletedAt', 'is', null)],
        }
    );

    const supports: readonly Capability[] = ALL_CAPABILITIES;

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
            let q = content.query.joined().where(whereFn);
            for (const [column, direction] of orderPairs) {
                q = q.orderBy(column, direction);
            }
            const data = await content.query.rows(await q.execute());
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const total = await content.query.count(whereFn);

        let rowsQ = content.query.joined().where(whereFn).limit(perPage).offset(offset);
        for (const [column, direction] of orderPairs) {
            rowsQ = rowsQ.orderBy(column, direction);
        }
        const data = await content.query.rows(await rowsQ.execute());
        return { data, total };
    }

    async function create(data: EntryWrite & { type: string }): Promise<EntryRow> {
        const { type, ...write } = data;
        return content.create(
            {
                type,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            },
            write
        );
    }

    const trash = {
        trash: async (id: string, actor?: string | null): Promise<void> => {
            const row = await entries.findOne({ id });
            if (!row) throw new Error(`Entry '${id}' not found`);

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt === null) {
                await entries.update(id, {
                    deletedAt: new Date(),
                    ...(actor === undefined ? {} : { updatedBy: actor }),
                });
            }
        },

        restore: async (id: string, actor?: string | null): Promise<EntryRow> => {
            // Guarded *and* returning: not expressible through the wrapper's
            // primary-key `update` / count-returning `updateMany`.
            await handle()
                .updateTable('entries')
                .set(
                    encodePatchWith(entriesTable, {
                        deletedAt: null,
                        updatedAt: new Date(),
                        ...(actor === undefined ? {} : { updatedBy: actor }),
                    }) as unknown as Updateable<DB['entries']>
                )
                .where((eb) =>
                    eb.and([eb('id', '=', id), eb('deletedAt', 'is not', null)])
                )
                .executeTakeFirstOrThrow();

            const restored = await content.anyLocale(id);
            if (!restored) throw new EntryNotFoundError({ entryId: id });
            return restored;
        },

        emptyTrash: async (type: string): Promise<void> => {
            await entries.deleteMany({ type, deletedAt: { ne: null } });
        },
    };

    const versions = {
        list: async (contentId: ContentRowId): Promise<EntryVersionRow[]> =>
            content.versions.list(contentId),
        get: async (versionId: string): Promise<EntryVersionRow | null> =>
            content.versions.get(versionId),
        create: async (snapshot: NewEntryVersionSnapshot): Promise<void> =>
            content.versions.create(snapshot),
        latestNumber: async (contentId: ContentRowId): Promise<number> =>
            content.versions.latestNumber(contentId),
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
        get: (ref: EntryRef, options?: { includeTrashed?: boolean }) =>
            content.get(ref, options),
        anyLocale: (id: string, options?: { includeTrashed?: boolean }) =>
            content.anyLocale(id, options),
        create,
        update: content.update,
        delete: content.delete,
        trash,
        versions,
        staging: content.staging,
        translatable: content.translatable,
        previewToken,
    } satisfies EntryRepository<EntryRow>;
}
