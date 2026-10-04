/**
 * Sharp image driver for Node.js: transforms to avif/webp at a given width,
 * keeping an animation in WebP, and generates a BlurHash placeholder. Not for
 * Cloudflare Workers — use the Cloudflare driver there.
 */

import type { ImageDriver, ImageSource } from '@/types/index';
import { encode } from 'blurhash';
import sharpLib from 'sharp';

/** The source types whose every frame a WebP variant keeps. */
const ANIMATED_TYPES = new Set(['image/webp', 'image/gif']);

/** The content types whose files hold HEVC, which prebuilt sharp cannot decode. */
const HEVC_TYPES = new Set(['image/heic', 'image/heif']);

/** A 64×64 grey HEIC of 342 bytes, decoded once to learn whether this libvips build can. */
const HEIC_SAMPLE =
    'AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABKW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABSQAAAA0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAK1pcHJwAAAAkGlwY28AAAB0aHZjQwEBYAAAAwCQAAADAADwAPz9+PgAAA8DoAABABhAAQwB//8BYAAAAwCQAAADAAADAB6VlAmhAAEAKEIBAQFgAAADAJAAAAMAAAMAHqAggQWWVlSkwvAWgIAAAAMAgAAADISiAAEABkQBwHPAiQAAABRpc3BlAAAAAAAAAEAAAABAAAAAFWlwbWEAAAAAAAAAAQABAoECAAAAFW1kYXQAAAAJKAGsdg2QkdI4';

/** Whether this process's libvips decodes HEVC, probed on first use. */
let decodesHevc: Promise<boolean> | undefined;

/** The quality each output format is encoded at. */
const QUALITY = { avif: 50, webp: 78 } as const;

export function sharp(): ImageDriver {
    return {
        name: 'sharp',
        cacheKey: `sharp-avif${QUALITY.avif}-webp${QUALITY.webp}`,

        async transform(
            src: ImageSource,
            opts: { width: number; format: 'avif' | 'webp' }
        ): Promise<{ body: Uint8Array; contentType: string }> {
            const bytes = await src.getBytes();
            // AVIF holds no animation in sharp: every frame would stack into one tall image.
            const animated =
                opts.format === 'webp' && ANIMATED_TYPES.has(src.contentType);

            const pipeline = sharpLib(Buffer.from(bytes), { animated })
                .rotate()
                .resize({ width: opts.width, withoutEnlargement: true });

            const encoded =
                opts.format === 'avif'
                    ? pipeline.avif({ quality: QUALITY.avif })
                    : pipeline.webp({ quality: QUALITY.webp });

            const out = await encoded.toBuffer();

            return {
                body: new Uint8Array(out),
                contentType: opts.format === 'avif' ? 'image/avif' : 'image/webp',
            };
        },

        async canTransform(contentType: string): Promise<boolean> {
            if (!HEVC_TYPES.has(contentType)) return true;
            decodesHevc ??= probeHevcDecoding();
            return decodesHevc;
        },

        async placeholder(bytes: Uint8Array): Promise<string | null> {
            try {
                // BlurHash ignores alpha, so a transparent pixel is hashed as white.
                const { data, info } = await sharpLib(Buffer.from(bytes))
                    .rotate()
                    .flatten({ background: '#ffffff' })
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

/** Decode the HEIC sample; prebuilt sharp's libheif has no HEVC decoder, so it fails. */
async function probeHevcDecoding(): Promise<boolean> {
    try {
        await sharpLib(Buffer.from(HEIC_SAMPLE, 'base64')).raw().toBuffer();
        return true;
    } catch {
        return false;
    }
}
