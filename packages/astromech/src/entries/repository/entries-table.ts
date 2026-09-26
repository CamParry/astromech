/**
 * The entry repository: the shared content repository over
 * `entries`/`entry_content`/`entry_versions`, plus the list reads and their
 * filters, the stored-row reads, slug uniquification, trash and preview tokens.
 */

import type {
    EntryRef,
    EntryResource,
    EntryWrite,
    ListParams,
    PreviewTokenRecord,
} from './types';
import type { ContentRowId, JoinedWhere } from '@/content/repository/types';
import type { Where } from '@/database/repository/where';
import type { EntryContentRow, EntryTableRow } from '@/entries/tables';
import type { JsonObject, ReferencesFilter, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository, lastUpdate } from '@/content/repository/content-table';
import { RESOURCE_SPECS } from '@/content/resources';
import { encodePatchWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { compileWhere } from '@/database/repository/where';
import { entriesTable, entryContentTable, entryVersionsTable } from '@/database/tables';
import { ResourceNotFoundError } from '@/errors/resource';
import { UnknownWhereKeyError } from '../errors';
import { isReferencesFilter } from './references-filter';

/** The expression builder the joined list query is compiled against. */
type JoinedEb = Parameters<JoinedWhere>[0];

/** The `where` keys that name a content-row column; `id` names the entry row's. */
const CONTENT_WHERE_KEYS = new Set(['status', 'slug', 'title']);

type OrderPair = [column: string, direction: 'asc' | 'desc'];

/** Sort columns on the entry row; every other sortable column is the content row's. */
const ENTRY_SORT_COLUMNS = new Set(['createdAt', 'updatedAt']);

/**
 * `createdAt` and `updatedAt` are the entry row's, every other sortable column
 * the content row's: the same split the returned shape makes.
 */
function orderPairs(sort?: SortOption | SortOption[]): OrderPair[] {
    return buildOrderBy(RESOURCE_SPECS.entry.sortable, sort, [
        { field: 'createdAt', direction: 'desc' },
    ]).map(
        ({ field, direction }): OrderPair => [
            ENTRY_SORT_COLUMNS.has(field) ? `entries.${field}` : `entryContent.${field}`,
            direction,
        ]
    );
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

        // `publishedAt` is stored as ISO text, so a string comparison orders by time.
        if (params.publishedAsOf !== undefined) {
            conditions.push(
                eb.or([
                    eb('entryContent.publishedAt', 'is', null),
                    eb(
                        'entryContent.publishedAt',
                        '<=',
                        params.publishedAsOf.toISOString()
                    ),
                ])
            );
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

        // where filters. Column keys compile through the shared `where` DSL
        // (database/repository/where.ts): `undefined` or an absent key means
        // unfiltered, a deliberate `null` renders `IS NULL`, and an array or
        // `{ in }` is a membership test.
        if (params.where) {
            for (const [key, value] of Object.entries(params.where)) {
                if (value === undefined) continue;
                if (key === 'locale') continue; // handled above

                if (CONTENT_WHERE_KEYS.has(key)) {
                    conditions.push(
                        compileWhere(
                            entryContentTable,
                            { [key]: value },
                            (column) => `entryContent.${column}`
                        )(eb)
                    );
                } else if (key === 'id') {
                    conditions.push(
                        compileWhere(
                            entriesTable,
                            { id: value } as Where<typeof entriesTable>,
                            (column) => `entries.${column}`
                        )(eb)
                    );
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

/** The two joined rows plus the locale list, as the resource the service reads. */
function toEntryResource(
    resourceRow: EntryTableRow,
    contentRow: EntryContentRow,
    locales: string[]
): EntryResource {
    return {
        id: contentRow.entryId,
        contentId: contentRow.id as ContentRowId,
        type: contentRow.type,
        locale: contentRow.locale,
        locales,
        staged: contentRow.stagedFor !== null,
        title: contentRow.title,
        slug: contentRow.slug,
        fields: (contentRow.fields ?? {}) as JsonObject,
        status: contentRow.status,
        publishedAt: contentRow.publishedAt,
        deletedAt: resourceRow.deletedAt,
        createdAt: resourceRow.createdAt,
        ...lastUpdate(resourceRow, contentRow),
        contentCreatedAt: contentRow.createdAt,
        contentUpdatedAt: contentRow.updatedAt,
        createdBy: contentRow.createdBy,
    };
}

/**
 * Build the entry repository. The db handle and the default locale resolve per
 * call, so the one object follows `setDb`, a transaction and a config reload.
 */
function createEntryRepository() {
    const resourceRows = createRepository(entriesTable);
    const contents = createRepository(entryContentTable);

    const content = createContentRepository(
        {
            table: entriesTable,
            contentTable: entryContentTable,
            versionsTable: entryVersionsTable,
            resourceIdColumn: 'entryId',
            // `entry_content.type` is copied from `entries.type`: the slug-unique
            // and list indexes cannot reach across the join.
            inheritedColumns: ['type'],
            insertDefaults: { title: '', slug: null },
        },
        {
            decode: toEntryResource,
            // Trash is resource-level, so it filters on the entry row.
            resourceFilter: (eb, options) =>
                options.includeTrashed === true
                    ? []
                    : [eb('entries.deletedAt', 'is', null)],
        }
    );

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
            const existing = await getDb()
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

    /**
     * The list predicate. Raw: search is `title LIKE ? OR slug LIKE ?` and the
     * flat `where` DSL has no `or`. `findMany` and `count` share it so they cannot drift.
     */
    function listWhere(params: ListParams): JoinedWhere {
        const types = typeof params.type === 'string' ? [params.type] : [...params.type];
        return buildListWhere(params, getDefaultContentLocale(), types);
    }

    async function findMany(params: ListParams): Promise<EntryResource[]> {
        let query = content.kysely().joined().where(listWhere(params));
        for (const [column, direction] of orderPairs(params.sort)) {
            query = query.orderBy(column, direction);
        }
        if (params.limit !== undefined) query = query.limit(params.limit);
        if (params.offset !== undefined) query = query.offset(params.offset);
        return content.decodeRows(await query.execute());
    }

    async function count(params: ListParams): Promise<number> {
        return content.count(listWhere(params));
    }

    /** Every `entries` row, of `type` when given, trashed rows included. */
    async function findEntryRowsByType(type?: string): Promise<EntryTableRow[]> {
        return resourceRows.findMany({ where: type === undefined ? {} : { type } });
    }

    /** Every `entry_content` row, of `type` when given, staged rows included. */
    async function findContentRowsByType(type?: string): Promise<EntryContentRow[]> {
        return contents.findMany({ where: type === undefined ? {} : { type } });
    }

    /** Every content row of one entry, in any locale, staged rows included. */
    async function findContentRowsByEntry(entryId: string): Promise<EntryContentRow[]> {
        return contents.findMany({ where: { entryId } });
    }

    async function create(data: EntryWrite & { type: string }): Promise<EntryResource> {
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
            const row = await resourceRows.findOne({ id });
            if (!row) throw new ResourceNotFoundError('entry', { id });

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt === null) {
                await resourceRows.update(id, {
                    deletedAt: new Date(),
                    ...(actor === undefined ? {} : { updatedBy: actor }),
                });
            }
        },

        restore: async (id: string, actor?: string | null): Promise<EntryResource> => {
            // Guarded *and* returning: not expressible through the wrapper's
            // primary-key `update` / count-returning `updateMany`.
            await getDb()
                .updateTable('entries')
                .set(
                    encodePatchWith(entriesTable, {
                        deletedAt: null,
                        updatedAt: new Date(),
                        ...(actor === undefined ? {} : { updatedBy: actor }),
                    })
                )
                .where((eb) =>
                    eb.and([eb('id', '=', id), eb('deletedAt', 'is not', null)])
                )
                .executeTakeFirstOrThrow();

            const restored = await content.findAnyLocale(id);
            if (!restored) throw new ResourceNotFoundError('entry', { id: id });
            return restored;
        },

        emptyTrash: async (type: string): Promise<void> => {
            await resourceRows.deleteMany({ type, deletedAt: { ne: null } });
        },
    };

    /**
     * Raw rather than `resourceRows.update`, which stamps `updatedAt`: a preview
     * token is access to the entry, not a change to it.
     */
    async function writePreviewToken(
        id: string,
        hash: string | null,
        expiresAt: Date | null
    ): Promise<void> {
        await getDb()
            .updateTable('entries')
            .set(
                encodePatchWith(entriesTable, {
                    previewToken: hash,
                    previewTokenExpiresAt: expiresAt,
                })
            )
            .where('id', '=', id)
            .execute();
    }

    const previewToken = {
        set: (id: string, hash: string, expiresAt: Date | null): Promise<void> =>
            writePreviewToken(id, hash, expiresAt),

        clear: (id: string): Promise<void> => writePreviewToken(id, null, null),

        findByHash: async (hash: string): Promise<PreviewTokenRecord | null> => {
            const row = await resourceRows.findOne({ previewToken: hash });
            if (!row) return null;
            return { id: row.id, expiresAt: row.previewTokenExpiresAt };
        },
    };

    return {
        uniqueSlug,
        findMany,
        count,
        findOne: async (
            { type, ...ref }: EntryRef & { type: string },
            options?: { includeTrashed?: boolean }
        ) => ofType(await content.findOne(ref, options), type),
        findAnyLocale: async (
            ref: { type: string; id: string },
            options?: { includeTrashed?: boolean }
        ) => ofType(await content.findAnyLocale(ref.id, options), ref.type),
        create,
        update: (ref: EntryRef, data: EntryWrite): Promise<EntryResource> =>
            content.update(ref, data),
        delete: content.delete,
        trash,
        versions: content.versions,
        staging: content.staging,
        translatable: content.translatable,
        previewToken,
        findEntryRowsByType,
        findContentRowsByType,
        findContentRowsByEntry,
    };
}

/** The one entry repository every entry type reads and writes through. */
export const entryRepository = createEntryRepository();

/** The resource when it is of the addressed type, else null. */
function ofType<R extends { type?: string }>(resource: R | null, type: string): R | null {
    return resource?.type === type ? resource : null;
}
