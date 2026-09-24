/**
 * The media repository — the shared content repository over
 * `media`/`media_content`/`media_versions`, plus the file-row repository and the
 * library list query with its filename search and mime bucket.
 */

import type { MediaContentRow, MediaTableRow, NewMediaTableRow } from './tables';
import type { ListPage } from '@/content/list';
import type { ContentRow, ContentWrite, JoinedWhere } from '@/content/repository/types';
import type {
    JsonObject,
    MediaMetadata,
    MediaMimeTypeFilter,
    MediaQueryParams,
    ResolvedConfig,
} from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { defaultContentLocale, getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { RESOURCE_SPECS } from '@/content/resources';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { mediaContentTable, mediaTable, mediaVersionsTable } from '@/database/tables';

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

/**
 * Build the media repository. It resolves its db handle per call, so a write
 * inside `transaction()` joins that transaction without being handed one.
 */
export function createMediaRepository(config?: ResolvedConfig) {
    const defaultLocale = config
        ? defaultContentLocale(config)
        : getDefaultContentLocale();
    const owners = createRepository(mediaTable);

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
     * Newest first unless `params.sort` says otherwise; an unknown sort throws.
     * Omit `page` for every match. Each row is read in `locale` where it has one.
     */
    async function list(
        params?: MediaQueryParams,
        page?: ListPage,
        locale?: string
    ): Promise<MediaRow[]> {
        return content.query.list({
            where: filter(params),
            orderBy: buildOrderBy(RESOURCE_SPECS.media.sortable, params?.sort, [
                { field: 'createdAt', direction: 'desc' },
            ]),
            page,
            locale,
        });
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

    /** One locale of one item, with no fallback. `findMedia` holds the fallback policy. */
    async function get(id: string, locale?: string): Promise<MediaRow | null> {
        return content.get({ id, locale });
    }

    async function create(own: NewMediaTableRow, write: ContentWrite): Promise<MediaRow> {
        return content.create(own, write);
    }

    /**
     * Drops the row and every relationship pointing at (or from) it. Call it
     * inside a transaction: an index outliving a failed delete would name a row
     * that is gone.
     */
    async function del(id: string): Promise<void> {
        await createRelationshipRepository().deleteByResource(id, 'media');
        await content.delete(id);
    }

    return {
        /**
         * The file row alone, for the reads and writes that never touch
         * authored content.
         */
        owners,
        list,
        listContent,
        count,
        get,
        create,
        update: content.update,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        anyLocale: content.anyLocale,
    };
}
