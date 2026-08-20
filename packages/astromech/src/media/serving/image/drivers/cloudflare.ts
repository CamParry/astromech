/**
 * Cloudflare Image Resizing driver. Transforms the publicly-reachable
 * original (`src.originUrl`) at the edge via `cf: { image }`; `getBytes` is
 * unused since Cloudflare fetches the origin itself. Caches at the edge.
 */

import type { ImageDriver } from '@/types/index';
import { CLOUDFLARE_IMAGES_DRIVER } from '@/media/image-drivers';

export function cloudflareImages(): ImageDriver {
    return {
        name: CLOUDFLARE_IMAGES_DRIVER,

        async transform(src, { width, format }) {
            const res = await fetch(src.originUrl, {
                cf: { image: { width, format } },
            } as RequestInit & { cf: unknown });

            if (!res.ok || !res.body) {
                throw new Error(`Cloudflare image transform failed: ${res.status}`);
            }

            return {
                body: res.body,
                contentType:
                    res.headers.get('content-type') ??
                    (format === 'avif' ? 'image/avif' : 'image/webp'),
            };
        },

        // placeholder: could be added via a WASM codec (e.g. squoosh/libvips) in a future v2.

        cachesVariants: true,
    };
}
