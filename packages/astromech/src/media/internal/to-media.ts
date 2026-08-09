/**
 * Row → `Media` serializer, and the delivery-URL policy it applies. Every read
 * path returns through here, so a `Media.url` is made in exactly one place.
 */

import config from 'virtual:astromech/config';
import { getStorageDriver } from '@/storage/registry';
import type { Media } from '@/types/index';
import type { MediaRow } from '../schema';
import { buildMediaUrl } from '../serving/image/url.shared';
import { extOf, originalKey } from './keys';

/** The stored row with its delivery URL resolved. */
export function toMedia(row: MediaRow): Media {
    return {
        ...row,
        url: resolveMediaUrl(row.id, row.filename),
    } as Media;
}

/**
 * Resolve the delivery URL for a media record — the one place the `media.access`
 * policy is applied, because `toMedia` is the one place a `Media.url` is made.
 *
 * `access: 'public'` prefers the driver's own URL; anything else (and any driver
 * without one) falls back to the proxying media route, which is what keeps
 * `filesystem()` in dev and `r2()` without a `publicUrl` working unchanged.
 *
 * A public URL must be PERMANENT. Astro bakes these into static HTML at build
 * time, and the same strings end up in `og:image`, RSS and email — so nothing
 * expiring may ever be returned from here. That is why presigned URLs are an
 * upload path, not the delivery path.
 */
function resolveMediaUrl(id: string, filename: string): string {
    if (config.media.access === 'public') {
        // Optional capability, genuinely absent on some drivers — feature-detect.
        const publicUrl =
            getStorageDriver().getPublicUrl?.(originalKey(id, filename)) ?? null;
        if (publicUrl !== null) return publicUrl;
    }
    return buildMediaUrl(config.mediaRoute, id, extOf(filename));
}
