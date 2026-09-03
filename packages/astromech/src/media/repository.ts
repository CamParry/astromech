/**
 * The media repository — the shared content repository over
 * `media`/`media_content`/`media_versions`, plus what only media has: the
 * library list query with its filename search, mime bucket and sort allow-list,
 * and a write that touches the file columns alone. Blob writes stay in the
 * service.
 */

import type { MediaContentRow, MediaTableRow, NewMediaTableRow } from './tables';
import type {
    ContentRef,
    ContentRow,
    ContentWrite,
    JoinedWhere,
} from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type {
    JsonObject,
    MediaMetadata,
    MediaMimeTypeFilter,
    MediaQueryParams,
    SortOption,
} from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { createContentRepository } from '@/content/repository/content-table';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { mediaContentTable, mediaTable, mediaVersionsTable } from '@/database/tables';
import { transaction } from '@/database/transaction';

/** One locale of one media item, as the media service reads it. */
export type MediaRow = ContentRow & {
    filename: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    metadata: MediaMetadata | null;
    title: string | null;
    alt: string | null;
    caption: string | null;
    /** The resource row's `updatedAt`: the file's last change. */
    fileUpdatedAt: Date;
    fileUpdatedBy: string | null;
};

/** Page slice for `list`; omit it for an unpaginated read. */
export type MediaPage = { limit: number; offset: number };

/** Columns a caller may order by. Anything else is ignored, not an error. */
const SORTABLE_COLS = ['filename', 'mimeType', 'size', 'createdAt'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

/** The expression builder the joined list query is compiled against. */
type JoinedEb = Parameters<JoinedWhere>[0];

export type MediaRepository = ReturnType<typeof createMediaRepository>;

/** The two joined rows plus the locale list, in the shape the service reads. */
function toMediaRow(
    media: MediaTableRow,
    content: MediaContentRow,
    locales: string[]
): MediaRow {
    return {
        id: content.mediaId,
        contentId: content.id as MediaRow['contentId'],
        locale: content.locale,
        locales,
        staged: false,
        fields: (content.fields ?? {}) as JsonObject,
        filename: media.filename,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width,
        height: media.height,
        metadata: media.metadata,
        title: content.title,
        alt: content.alt,
        caption: content.caption,
        createdAt: media.createdAt,
        createdBy: media.createdBy,
        updatedAt: content.updatedAt,
        updatedBy: content.updatedBy,
        fileUpdatedAt: media.updatedAt,
        fileUpdatedBy: media.updatedBy,
    };
}

/**
 * The mime "bucket" predicate. `null` when no bucket is selected, so the caller
 * can leave it out of the AND entirely.
 */
function mimeBucket(
    eb: JoinedEb,
    ownerKey: string,
    bucket: MediaMimeTypeFilter | undefined
): Expression<SqlBool> | null {
    const column = `${ownerKey}.mimeType`;
    if (bucket === 'images') return eb(column, 'like', 'image/%');
    if (bucket === 'videos') return eb(column, 'like', 'video/%');
    if (bucket === 'documents') {
        return eb.or([eb(column, 'like', 'application/%'), eb(column, 'like', 'text/%')]);
    }
    if (bucket === 'other') {
        // NOT (image/* OR video/* OR application/* OR text/*)
        // Raw sql uses the table-qualified snake_case column — CamelCasePlugin
        // does not transform raw fragments, and `media_content` is joined in.
        return sql<SqlBool>`media.mime_type NOT LIKE 'image/%' AND media.mime_type NOT LIKE 'video/%' AND media.mime_type NOT LIKE 'application/%' AND media.mime_type NOT LIKE 'text/%'`;
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

/**
 * Build the media repository. It resolves its db handle per call, so a write
 * inside `transaction()` joins that transaction without being handed one.
 */
export function createMediaRepository(opts?: { defaultLocale?: string }) {
    const defaultLocale = opts?.defaultLocale ?? getDefaultContentLocale();
    const media = createRepository(mediaTable);
    const contents = createRepository(mediaContentTable);

    const content = createContentRepository(
        {
            table: mediaTable,
            contentTable: mediaContentTable,
            versionsTable: mediaVersionsTable,
            ownerColumn: 'mediaId',
        },
        { decode: toMediaRow, defaultLocale }
    );

    const { ownerKey, contentKey } = content.query;

    /**
     * The library list predicate. Rows and count share it so the two cannot
     * drift; the locale is pinned to the default, which every media item has a
     * row in.
     */
    function filter(params?: MediaQueryParams): JoinedWhere {
        const search = params?.search;
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [
                eb(`${contentKey}.locale`, '=', defaultLocale),
            ];
            if (search) {
                conditions.push(eb(`${ownerKey}.filename`, 'like', `%${search}%`));
            }
            const bucket = mimeBucket(eb, ownerKey, params?.where?.mimeType);
            if (bucket) conditions.push(bucket);
            return eb.and(conditions);
        };
    }

    /**
     * Replace each row's content with the requested locale's, where that locale
     * has a row. One query for the whole page; a row with no match keeps the
     * default locale's content, which is the fallback a media read promises.
     */
    async function overlayLocale(rows: MediaRow[], locale: string): Promise<MediaRow[]> {
        if (rows.length === 0) return rows;
        const translations = await contents.findMany({
            where: { mediaId: { in: rows.map((row) => row.id) }, locale },
        });
        const byMediaId = new Map(translations.map((row) => [row.mediaId, row]));

        return rows.map((row) => {
            const translation = byMediaId.get(row.id);
            if (!translation) return row;
            return {
                ...row,
                contentId: translation.id as MediaRow['contentId'],
                locale: translation.locale,
                title: translation.title,
                alt: translation.alt,
                caption: translation.caption,
                fields: (translation.fields ?? {}) as JsonObject,
                updatedAt: translation.updatedAt,
                updatedBy: translation.updatedBy,
                createdBy: translation.createdBy,
            };
        });
    }

    /** Newest first unless `params.sort` says otherwise. Omit `page` for every match. */
    async function list(
        params?: MediaQueryParams,
        page?: MediaPage,
        locale?: string
    ): Promise<MediaRow[]> {
        let q = content.query.joined().where(filter(params));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(`${ownerKey}.${col}`, dir);
        }
        if (page) q = q.limit(page.limit).offset(page.offset);
        const rows = await content.query.rows(await q.execute());
        if (locale === undefined || locale === defaultLocale) return rows;
        return overlayLocale(rows, locale);
    }

    async function count(params?: MediaQueryParams): Promise<number> {
        return content.query.count(filter(params));
    }

    /** Every media item's content row in `locale`, for the uniqueness scan. */
    async function listContent(locale: string): Promise<MediaRow[]> {
        const raw = await content.query
            .joined()
            .where((eb) => eb(`${contentKey}.locale`, '=', locale))
            .execute();
        return content.query.rows(raw);
    }

    /**
     * One locale of one item, falling back to the default locale when that one
     * has no content row. The returned row's `locale` names where the content
     * came from, which is the contract a media read states.
     */
    async function get(id: string, locale?: string): Promise<MediaRow | null> {
        return (await content.get({ id, locale })) ?? (await content.get({ id }));
    }

    /** One locale of one item, with no fallback — what versions address. */
    async function getExact(id: string, locale: string): Promise<MediaRow | null> {
        return content.get({ id, locale });
    }

    async function create(own: NewMediaTableRow, write: ContentWrite): Promise<MediaRow> {
        return content.create(own, write);
    }

    /**
     * Write the file columns of the resource row, leaving every content row
     * untouched — what `replace` does. Throws when no row matched.
     */
    async function updateFile(
        id: string,
        patch: Patch<typeof mediaTable>
    ): Promise<MediaRow> {
        await media.update(id, patch);
        const row = await get(id);
        if (!row) throw new Error(`Media '${id}' not found`);
        return row;
    }

    /** Write one locale's content row, creating it when it does not exist. */
    async function update(ref: ContentRef, data: ContentWrite): Promise<MediaRow> {
        return content.update(ref, data);
    }

    /**
     * Drops the row and every relationship pointing at (or from) it. One
     * transaction: an index outliving a failed delete would name a row that is
     * gone.
     */
    async function del(id: string): Promise<void> {
        await transaction(async () => {
            await createRelationshipRepository().deleteByResource(id, 'media');
            await content.delete(id);
        });
    }

    return {
        list,
        listContent,
        count,
        get,
        getExact,
        create,
        updateFile,
        update,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        anyLocale: content.anyLocale,
    };
}
