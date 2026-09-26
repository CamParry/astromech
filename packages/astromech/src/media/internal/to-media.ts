/**
 * `MediaResource` → `Media` serializer. The resource already carries its
 * delivery URL, which `toMediaResource` resolves.
 */

import type { MediaResource } from '../repository';
import type { Media } from '@/types/index';

/**
 * The public `Media`, mapped column by column rather than spread, so the
 * internal members never leave the repository layer.
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
        updatedAt: resource.updatedAt,
        createdBy: resource.createdBy ?? null,
        updatedBy: resource.updatedBy ?? null,
    };
}
