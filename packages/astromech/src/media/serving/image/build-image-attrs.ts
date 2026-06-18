/**
 * Framework-agnostic core for building <picture>/<img> attrs from a media record.
 *
 * Returns plain data; framework renderers (Image.astro, future React) consume it.
 */

import type { ImageFormat } from './url.js';
import { buildMediaUrl, buildVariantUrl, normaliseWidths } from './url.js';
import { isOptimisableImage } from './dimensions.js';

export type ImageAttrsInput = {
    id: string;
    filename: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    version?: string | null;
    blurhash?: string | null;
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

export function buildImageAttrs(
    input: ImageAttrsInput,
    options: ImageAttrsOptions,
    ctx: ImageAttrsContext
): ImageAttrs {
    const ext = extFromFilename(input.filename);
    const sizes = options.sizes ?? '100vw';
    const bareUrl = buildMediaUrl(ctx.mediaRoute, input.id, ext);

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
