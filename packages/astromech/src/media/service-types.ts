/**
 * The media service contract and its input types: what `app.media` offers.
 * `service.ts` binds the definition that implements it.
 */

import type { updateMediaSchema } from './schema';
import type {
    JsonObject,
    Media,
    MediaVersion,
    Usage,
    VersionMetadata,
} from '@/types/domain';
import type { MediaQueryParams, QueryResult } from '@/types/query';
import type { z } from 'zod';

/** What one `media.update` call may write. */
export type MediaUpdateData = z.input<typeof updateMediaSchema>;

/**
 * The media domain's service contract. A missing `locale` is the default content
 * locale; `query` and `get` fall back to it when the one asked for has no
 * content row, while the version methods address a content row and
 * throw `ResourceNotFoundError` when there is none.
 */
export type MediaService = {
    query(params?: MediaQueryParams): Promise<QueryResult<Media>>;
    get(params: { id: string; locale?: string }): Promise<Media | null>;
    upload(params: {
        file: File;
        data?: { fields?: JsonObject | undefined };
    }): Promise<Media>;
    replace(params: { id: string; file: File }): Promise<Media>;
    update(params: {
        id: string;
        locale?: string;
        data: MediaUpdateData;
    }): Promise<Media>;
    delete(params: { id: string }): Promise<void>;
    /** Every reference to this media item, from any resource. */
    usedBy(params: { id: string }): Promise<Usage[]>;
    /** This locale's saved versions, newest first, as their metadata. */
    versions(params: { id: string; locale?: string }): Promise<VersionMetadata[]>;
    /** One saved version of this locale, by its number, with its snapshot. */
    getVersion(params: {
        id: string;
        locale?: string;
        version: number;
    }): Promise<MediaVersion>;
    restoreVersion(params: {
        id: string;
        locale?: string;
        version: number;
    }): Promise<Media>;
};
