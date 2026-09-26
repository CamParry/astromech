/**
 * The delivery-URL policy for a media item. `toMediaResource` is its one
 * caller, so a media URL is made in exactly one place.
 */

import { getConfig } from '@/config/registry';
import { getStorageDriver } from '@/storage/registry';
import { buildMediaUrl } from '../serving/image/url';
import { extOf, originalKey } from './keys';

/**
 * Resolve the delivery URL for a media item. `access: 'public'` prefers the
 * driver's own URL, falling back to the proxying media route otherwise. The
 * URL is permanent, because it is baked into static HTML and email.
 */
export function resolveMediaUrl(id: string, filename: string): string {
    const config = getConfig();
    if (config.media.access === 'public') {
        // Optional capability, absent on some drivers, so feature-detect it.
        const publicUrl =
            getStorageDriver().getPublicUrl?.(originalKey(id, filename)) ?? null;
        if (publicUrl !== null) return publicUrl;
    }
    return buildMediaUrl(config.mediaRoute, id, extOf(filename));
}
