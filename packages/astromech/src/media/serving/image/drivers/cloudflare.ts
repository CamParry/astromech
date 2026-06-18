/**
 * Cloudflare Image Resizing driver.
 *
 * Uses Cloudflare's built-in image resizing (cf.image) to transform the
 * publicly-reachable original (`src.originUrl`) at the edge. The Worker
 * passes a `cf: { image: { width, format } }` init bag to `fetch`; Cloudflare
 * intercepts the subrequest and returns the resized image directly.
 *
 * `src.getBytes` is intentionally unused on this code path — the resizing
 * happens inside Cloudflare's network from the origin URL, so there is no need
 * to proxy the bytes through the Worker.
 *
 * `cachesVariants: true` — Cloudflare's edge cache fronts the resizing Worker,
 * so variant write-back to storage is unnecessary and is skipped.
 */

import type { ImageDriver } from '@/types/index.js';

export function cloudflareImages(): ImageDriver {
    return {
        name: 'cloudflare-images',

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
