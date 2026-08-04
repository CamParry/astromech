/**
 * Media storage — the only place Kysely touches the `media` table.
 *
 * Row CRUD goes through `createStorage(mediaTable)`, which owns encoding, `updatedAt`
 * stamping and row decoding. `list`/`count` stay on the raw handle because the
 * mime-bucket filter is not expressible in the flat `where` DSL: `documents` is an
 * OR and `other` is a raw negated-LIKE fragment. They compile their DSL-expressible
 * part (the filename search) with the wrapper's own `where`, handed out by
 * `query()`, and AND the bucket predicate onto it — so the two share ONE predicate
 * and cannot drift apart.
 *
 * The file-storage driver calls (`put`/`delete`, variant cleanup) stay in the
 * service: they are not database access.
 */

import { sql, type Expression, type SqlBool } from 'kysely';
import { decodeWith } from '@/database/codec.js';
import {
    createStorage,
    type Patch,
    type QueryHandle,
} from '@/database/storage/create-storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { mediaTable } from '@/database/schema.js';
import { getDb } from '@/database/registry.js';
import type { Db } from '@/database/types.js';
import type { MediaMimeTypeFilter, MediaQueryParams, SortOption } from '@/types/index.js';
import type { MediaRow, NewMediaRow } from './schema.js';

type Predicate = ReturnType<QueryHandle<typeof mediaTable>['where']>;
type MediaEb = Parameters<Predicate>[0];

/** Page slice for `list`; omit it for an unpaginated read. */
export type MediaPage = { limit: number; offset: number };

/** Columns a caller may order by. Anything else is ignored, not an error. */
const SORTABLE_COLS = ['filename', 'mimeType', 'size', 'createdAt'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

export type MediaStorage = ReturnType<typeof createMediaStorage>;

/**
 * The mime "bucket" predicate. `null` when no bucket is selected, so the caller
 * can leave it out of the AND entirely.
 */
function mimeBucket(
    eb: MediaEb,
    bucket: MediaMimeTypeFilter | undefined
): Expression<SqlBool> | null {
    if (bucket === 'images') return eb('mimeType', 'like', 'image/%');
    if (bucket === 'videos') return eb('mimeType', 'like', 'video/%');
    if (bucket === 'documents') {
        return eb.or([
            eb('mimeType', 'like', 'application/%'),
            eb('mimeType', 'like', 'text/%'),
        ]);
    }
    if (bucket === 'other') {
        // NOT (image/* OR video/* OR application/* OR text/*)
        // Raw sql uses snake_case col — CamelCasePlugin does not transform raw fragments.
        return sql<SqlBool>`mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'application/%' AND mime_type NOT LIKE 'text/%'`;
    }
    return null;
}

/** Order-by clauses for a sort option, falling back to newest-first. */
function buildOrderBy(
    sort?: SortOption | SortOption[]
): { col: SortableCol; dir: 'asc' | 'desc' }[] {
    const fallback: { col: SortableCol; dir: 'asc' | 'desc' }[] = [
        { col: 'createdAt', dir: 'desc' },
    ];
    if (!sort) return fallback;
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!(SORTABLE_COLS as readonly string[]).includes(field)) return [];
            if (dir !== 'asc' && dir !== 'desc') return [];
            return [{ col: field as SortableCol, dir }];
        })
    );
    return clauses.length > 0 ? clauses : fallback;
}

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createMediaStorage(db?: Db) {
    const storage = createStorage(mediaTable, db);

    function filter(params?: MediaQueryParams): Predicate {
        const { where } = storage.query();
        const search = params?.search;
        const dsl = where(search ? { filename: { like: `%${search}%` } } : undefined);
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [dsl(eb)];
            const bucket = mimeBucket(eb, params?.where?.mimeType);
            if (bucket) conditions.push(bucket);
            return eb.and(conditions);
        };
    }

    /** Newest first unless `params.sort` says otherwise. Omit `page` for every match. */
    async function list(
        params?: MediaQueryParams,
        page?: MediaPage
    ): Promise<MediaRow[]> {
        const { db: handle, table } = storage.query();
        let q = handle.selectFrom(table).selectAll().where(filter(params));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(col, dir);
        }
        if (page) q = q.limit(page.limit).offset(page.offset);
        const rows = await q.execute();
        return rows.map((row) => decodeWith(mediaTable, row) as unknown as MediaRow);
    }

    async function count(params?: MediaQueryParams): Promise<number> {
        const { db: handle, table } = storage.query();
        const row = await handle
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .where(filter(params))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    async function get(id: string): Promise<MediaRow | null> {
        return storage.findOne({ id });
    }

    async function create(data: NewMediaRow): Promise<MediaRow> {
        return storage.create(data);
    }

    /** By primary key. Throws when no row matched. */
    async function update(
        id: string,
        patch: Patch<typeof mediaTable>
    ): Promise<MediaRow> {
        return storage.update(id, patch);
    }

    /** Drops the row and every relationship pointing at (or from) it. */
    async function del(id: string): Promise<void> {
        await createRelationshipStorage(db ?? getDb()).deleteByResource(id, 'media');
        await storage.delete(id);
    }

    return { list, count, get, create, update, delete: del };
}
