/**
 * The media repository: the shared content repository over
 * `media`/`media_content`/`media_versions`, the media reads with their locale
 * fallback, filename search and mime bucket, and the named file-row reads and writes.
 */

import type { MediaContentRow, MediaTableRow, NewMediaTableRow } from './tables';
import type { ContentRow, ContentWrite, JoinedWhere } from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type {
    JsonObject,
    MediaMetadata,
    MediaMimeTypeFilter,
    SortOption,
} from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { relationshipRepository } from '@/content/repository/relationships';
import { RESOURCE_SPECS } from '@/content/resources';
import { chunks } from '@/database/chunks';
import { kyselyTableKey } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
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

/** What `findMany` and `count` filter, order and page by. */
export type MediaListParams = {
    search?: string | undefined;
    where?: { mimeType?: MediaMimeTypeFilter | undefined } | undefined;
    sort?: SortOption | SortOption[] | undefined;
    /** The locale each row is read in where it has one; the default otherwise. */
    locale?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

/** The file-row columns a file replace writes. */
type MediaFilePatch = Pick<
    Patch<typeof mediaTable>,
    'filename' | 'mimeType' | 'size' | 'width' | 'height' | 'metadata' | 'updatedBy'
>;

/** The expression builder the joined list query is compiled against. */
type JoinedEb = Parameters<JoinedWhere>[0];

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
        // Raw sql uses the table-qualified snake_case column: CamelCasePlugin
        // does not transform raw fragments, and `media_content` is joined in.
        return sql<SqlBool>`media.mime_type NOT LIKE 'image/%' AND media.mime_type NOT LIKE 'video/%' AND media.mime_type NOT LIKE 'application/%' AND media.mime_type NOT LIKE 'text/%'`;
    }
    return null;
}

/**
 * Every handle and the default locale resolve per call, so the one registered
 * repository follows a transaction scope and a config reload.
 */
function createMediaRepository() {
    const owners = createRepository(mediaTable);
    const content = createContentRepository(
        {
            table: mediaTable,
            contentTable: mediaContentTable,
            versionsTable: mediaVersionsTable,
            ownerColumn: 'mediaId',
        },
        { decode: toMediaRow }
    );

    const ownerKey = kyselyTableKey(mediaTable.name);
    const contentKey = kyselyTableKey(mediaContentTable.name);

    /**
     * The library list predicate. Rows and count share it so the two cannot
     * drift; the locale is pinned to the default, which every media item has a
     * row in.
     */
    function filter(params: MediaListParams): JoinedWhere {
        const { search } = params;
        const defaultLocale = getDefaultContentLocale();
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [
                eb(`${contentKey}.locale`, '=', defaultLocale),
            ];
            if (search) {
                conditions.push(eb(`${ownerKey}.filename`, 'like', `%${search}%`));
            }
            const bucket = mimeBucket(eb, ownerKey, params.where?.mimeType);
            if (bucket) conditions.push(bucket);
            return eb.and(conditions);
        };
    }

    /**
     * Newest first unless `params.sort` says otherwise; an unknown sort throws.
     * Omit `limit` for every match.
     */
    async function findMany(params: MediaListParams = {}): Promise<MediaRow[]> {
        return content.findMany({
            where: filter(params),
            orderBy: buildOrderBy(RESOURCE_SPECS.media.sortable, params.sort, [
                { field: 'createdAt', direction: 'desc' },
            ]),
            limit: params.limit,
            offset: params.offset,
            locale: params.locale,
        });
    }

    async function count(params: MediaListParams = {}): Promise<number> {
        return content.count(filter(params));
    }

    /** Every content row written in `locale`, for the uniqueness and validity scans. */
    async function findByLocale(locale: string): Promise<MediaRow[]> {
        const raw = await content
            .kysely()
            .joined()
            .where((eb) => eb(`${contentKey}.locale`, '=', locale))
            .execute();
        return content.decodeRows(raw);
    }

    /**
     * One media item in `locale` (the default when absent). With
     * `fallbackLocale`, a miss reads that locale instead.
     */
    async function findOne(
        id: string,
        options?: { locale?: string | undefined; fallbackLocale?: string | undefined }
    ): Promise<MediaRow | null> {
        const locale = options?.locale ?? getDefaultContentLocale();
        const found = await content.findOne({ id, locale });
        const fallbackLocale = options?.fallbackLocale;
        if (found || fallbackLocale === undefined || fallbackLocale === locale) {
            return found;
        }
        return content.findOne({ id, locale: fallbackLocale });
    }

    /** The file rows for `ids`, in slices small enough for one `IN (…)` each. */
    async function findFiles(ids: Iterable<string>): Promise<MediaTableRow[]> {
        const rows: MediaTableRow[] = [];
        for (const chunk of chunks(ids)) {
            rows.push(...(await owners.findMany({ where: { id: { in: chunk } } })));
        }
        return rows;
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
        await relationshipRepository.deleteByResource(id, 'media');
        await content.delete(id);
    }

    return {
        findOne,
        findAnyLocale: content.findAnyLocale,
        findMany,
        count,
        findByLocale,
        /** The file row alone, with no authored content, or null. */
        findFile: (id: string): Promise<MediaTableRow | null> => owners.findOne({ id }),
        findFiles,
        create,
        update: content.update,
        /** Write the file-row columns, whatever the locale. */
        updateFile: async (id: string, patch: MediaFilePatch): Promise<void> => {
            await owners.update(id, patch);
        },
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        findStoredRows: content.findStoredRows,
    };
}

/** The media repository. Stateless: every handle and the default locale resolve per call. */
export const mediaRepository = createMediaRepository();
