/**
 * Framework-agnostic core for building <picture>/<img> attrs from a media record.
 *
 * Returns plain data; framework renderers (Image.astro, future React) consume it.
 */

import type { ImageFormat } from './url.shared';
import { normaliseWidths } from '@/media/image-widths.shared';
import { isOptimisableImage } from './dimensions';
import { buildMediaUrl, buildVariantUrl } from './url.shared';

export type ImageAttrsInput = {
    id: string;
    filename: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    version?: string | null;
    blurhash?: string | null;
    /**
     * Already-resolved original URL (from `Media.url`), honouring media access
     * mode. Falls back to the media route when absent.
     */
    url?: string | null;
};

export type ImageAttrsContext = {
    mediaRoute: string;
    widths: number[];
    avif: boolean;
};

export type ImageAttrsOptions = {
    sizes?: string;
    widths?: number[];
};

export type ImageAttrs = {
    sources: { type: string; srcset: string; sizes: string }[];
    img: { src: string; width?: number; height?: number; sizes: string };
    blurhash?: string | null;
};

function extFromFilename(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1) : '';
}

function makeImg(
    src: string,
    width: number | null | undefined,
    height: number | null | undefined,
    sizes: string
): ImageAttrs['img'] {
    const img: ImageAttrs['img'] = { src, sizes };
    if (width != null) img.width = width;
    if (height != null) img.height = height;
    return img;
}

/** Compute `<picture>`/`<img>` attrs (sources, sizes, blurhash) for one media record. */
export function buildImageAttrs(
    input: ImageAttrsInput,
    options: ImageAttrsOptions,
    ctx: ImageAttrsContext
): ImageAttrs {
    const ext = extFromFilename(input.filename);
    const sizes = options.sizes ?? '100vw';
    // The bare <img> src is the original, so it honours the access mode: use the
    // already-resolved `Media.url` when the caller passed one.
    const bareUrl = input.url ?? buildMediaUrl(ctx.mediaRoute, input.id, ext);

    const bareImg: ImageAttrs = {
        sources: [],
        img: makeImg(bareUrl, input.width, input.height, sizes),
        blurhash: input.blurhash ?? null,
    };

    const version = input.version;

    const optimisable =
        isOptimisableImage(input.mimeType) && version != null && ctx.widths.length > 0;

    if (!optimisable || version == null) {
        return bareImg;
    }

    const base = options.widths ?? ctx.widths;
    const ladder = normaliseWidths(base).filter(
        (w) => input.width == null || w <= input.width
    );

    if (ladder.length === 0) {
        return bareImg;
    }

    const formats: ImageFormat[] = ctx.avif ? ['avif', 'webp'] : ['webp'];

    // Variant URLs ALWAYS stay on the media route, whatever the access mode: a
    // variant is generated on demand by `handleMediaRequest` on a cache miss, so
    // a direct storage URL would 404 until something happened to produce it.
    const sources = formats.map((format) => ({
        type: `image/${format}`,
        srcset: ladder
            .map(
                (w) =>
                    buildVariantUrl(ctx.mediaRoute, input.id, ext, {
                        width: w,
                        format,
                        version,
                    }) +
                    ' ' +
                    w +
                    'w'
            )
            .join(', '),
        sizes,
    }));

    return {
        sources,
        img: makeImg(bareUrl, input.width, input.height, sizes),
        blurhash: input.blurhash ?? null,
    };
}
