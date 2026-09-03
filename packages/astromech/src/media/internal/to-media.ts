/**
 * Row → `Media` serializer, and the delivery-URL policy it applies. Every read
 * path returns through here, so a `Media.url` is made in exactly one place.
 */

import type { MediaRow } from '../repository';
import type { Media } from '@/types/index';
import { getConfig } from '@/config/registry';
import { getStorageDriver } from '@/storage/registry';
import { buildMediaUrl } from '../serving/image/url.shared';
import { extOf, originalKey } from './keys';

/**
 * The stored row with its delivery URL resolved. Mapped column by column, not
 * spread: `contentId` never leaves the repository layer, and `Media.updatedAt`
 * is the file's last change, which the row carries as `fileUpdatedAt`.
 */
export function toMedia(row: MediaRow): Media {
    return {
        id: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        size: row.size,
        url: resolveMediaUrl(row.id, row.filename),
        width: row.width,
        height: row.height,
        metadata: row.metadata,
        locale: row.locale,
        locales: row.locales,
        title: row.title,
        alt: row.alt,
        caption: row.caption,
        fields: row.fields,
        createdAt: row.createdAt,
        updatedAt: row.fileUpdatedAt,
        createdBy: row.createdBy ?? null,
        updatedBy: row.fileUpdatedBy,
    };
}

/**
 * Resolve the delivery URL for a media record. `access: 'public'` prefers
 * the driver's own URL, falling back to the proxying media route otherwise.
 * Must return a PERMANENT URL — these get baked into static HTML and email.
 */
function resolveMediaUrl(id: string, filename: string): string {
    const config = getConfig();
    if (config.media.access === 'public') {
        // Optional capability, genuinely absent on some drivers — feature-detect.
        const publicUrl =
            getStorageDriver().getPublicUrl?.(originalKey(id, filename)) ?? null;
        if (publicUrl !== null) return publicUrl;
    }
    return buildMediaUrl(config.mediaRoute, id, extOf(filename));
}
