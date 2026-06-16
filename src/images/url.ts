export type ImageFormat = 'avif' | 'webp';

export type ParsedImageParams = {
    width: number | null;
    format: ImageFormat | null;
    version: string | null;
};

/** Canonical original URL. */
export function buildMediaUrl(mediaRoute: string, id: string, ext: string): string {
    return `${mediaRoute}/${id}.${ext}`;
}

/** Canonical versioned variant URL. */
export function buildVariantUrl(
    mediaRoute: string,
    id: string,
    ext: string,
    opts: { width: number; format: ImageFormat; version: string }
): string {
    const base = buildMediaUrl(mediaRoute, id, ext);
    return `${base}?w=${opts.width}&f=${opts.format}&v=${opts.version}`;
}

/** Parse image params off a URLSearchParams (the `?w&f&v`). */
export function parseImageParams(search: URLSearchParams): ParsedImageParams {
    const rawW = search.get('w');
    const rawF = search.get('f');
    const rawV = search.get('v');

    let width: number | null = null;
    if (rawW !== null) {
        const n = Number(rawW);
        if (!Number.isNaN(n) && n > 0 && Number.isInteger(n)) {
            width = n;
        }
    }

    const format: ImageFormat | null = isImageFormat(rawF ?? '')
        ? (rawF as ImageFormat)
        : null;
    const version: string | null = rawV !== null && rawV.length > 0 ? rawV : null;

    return { width, format, version };
}

export function isImageFormat(value: string): value is ImageFormat {
    return value === 'avif' || value === 'webp';
}

/** Width must be one of the allowlist values (server-side guard). */
export function isAllowedWidth(width: number, widths: readonly number[]): boolean {
    return widths.includes(width);
}

/** Storage key for a cached transformed variant. */
export function variantStorageKey(
    id: string,
    version: string,
    width: number,
    format: ImageFormat
): string {
    return `variants/${id}/${version}/${width}.${format}`;
}

/** The variants/<id>/ prefix used to purge all variants of a media item. */
export function variantPrefix(id: string): string {
    return `variants/${id}/`;
}

/** Dedupe + ascending sort. */
export function normaliseWidths(widths: readonly number[]): number[] {
    return [...new Set(widths)].sort((a, b) => a - b);
}

/** The srcset width ladder for a given intrinsic width: the allowlist, deduped+sorted,
 *  filtered to <= intrinsicWidth (never upscale). If every allowlist width exceeds the
 *  intrinsic width, return just [intrinsicWidth] (so at least one source is emitted). */
export function widthLadder(widths: readonly number[], intrinsicWidth: number): number[] {
    const sorted = normaliseWidths(widths);
    const filtered = sorted.filter((w) => w <= intrinsicWidth);
    return filtered.length > 0 ? filtered : [intrinsicWidth];
}
