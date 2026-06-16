/**
 * Sharp image driver for Node.js environments.
 *
 * Transforms images to avif/webp at a given width using the `sharp` library.
 * Quality is baked per-format (spec decision: no `quality` URL param):
 *   - avif → 50
 *   - webp → 78
 *
 * Also generates a BlurHash placeholder string from a 32×32 downscaled raster.
 * Not suitable for Cloudflare Workers — use the Cloudflare Images driver there.
 */

import sharpLib from 'sharp';
import { encode } from 'blurhash';
import type { ImageDriver, ImageSource } from '@/types/index.js';

export function sharp(): ImageDriver {
    return {
        name: 'sharp',

        async transform(
            src: ImageSource,
            opts: { width: number; format: 'avif' | 'webp' }
        ): Promise<{ body: Uint8Array; contentType: string }> {
            const bytes = await src.getBytes();

            const pipeline = sharpLib(Buffer.from(bytes))
                .rotate()
                .resize({ width: opts.width, withoutEnlargement: true });

            const encoded =
                opts.format === 'avif'
                    ? pipeline.avif({ quality: 50 })
                    : pipeline.webp({ quality: 78 });

            const out = await encoded.toBuffer();

            return {
                body: new Uint8Array(out),
                contentType: opts.format === 'avif' ? 'image/avif' : 'image/webp',
            };
        },

        async placeholder(bytes: Uint8Array): Promise<string | null> {
            try {
                const { data, info } = await sharpLib(Buffer.from(bytes))
                    .raw()
                    .ensureAlpha()
                    .resize(32, 32, { fit: 'inside' })
                    .toBuffer({ resolveWithObject: true });

                return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
            } catch {
                return null;
            }
        },

        cachesVariants: false,
    };
}
