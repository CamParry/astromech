/**
 * `MediaResource` → `Media` serializer. The resource already carries its
 * delivery URL, which `toMediaResource` resolves.
 */

import type { MediaResource } from '../repository';
import type { Media } from '@/types/index';

/**
 * The public `Media`, mapped column by column rather than spread: `contentId`
 * never leaves the repository layer, and `Media.updatedAt` is the file's last
 * change, which the resource carries as `fileUpdatedAt`.
 */
export function toMedia(resource: MediaResource): Media {
    return {
        id: resource.id,
        filename: resource.filename,
        mimeType: resource.mimeType,
        size: resource.size,
        url: resource.url,
        width: resource.width,
        height: resource.height,
        metadata: resource.metadata,
        locale: resource.locale,
        locales: resource.locales,
        title: resource.title,
        alt: resource.alt,
        caption: resource.caption,
        fields: resource.fields,
        createdAt: resource.createdAt,
        updatedAt: resource.fileUpdatedAt,
        createdBy: resource.createdBy ?? null,
        updatedBy: resource.fileUpdatedBy,
    };
}
