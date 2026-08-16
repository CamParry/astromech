import { getConfig } from '@/config/registry';
import { mediaService } from '@/media/service';
import { getStorageDriver } from '@/storage/registry';
import { getImageConfig } from './image/registry';
import {
    parseImageParams,
    isAllowedWidth,
    buildMediaUrl,
    buildVariantUrl,
    variantStorageKey,
} from './image/url.shared';
import type { ImageFormat } from './image/url.shared';
import { isOptimisableImage } from './image/dimensions';
import type { ImageSource, StorageDriver } from '@/types/index';

export type MediaRequestInfo = {
    id: string;
    ext: string;
    search: URLSearchParams;
    origin: string;
    ifNoneMatch?: string | null;
    /** Raw `Range` request header. Honoured for originals only (see below). */
    range?: string | null;
};

async function streamToBytes(stream: ReadableStream): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

async function toBytes(body: ReadableStream | Uint8Array): Promise<Uint8Array> {
    if (body instanceof Uint8Array) return body;
    return streamToBytes(body);
}

function contentTypeForFormat(format: ImageFormat): string {
    return format === 'avif' ? 'image/avif' : 'image/webp';
}

/** File extension (without the dot) from a stored filename, or '' when none. */
function extOf(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1) : '';
}

export async function handleMediaRequest(info: MediaRequestInfo): Promise<Response> {
    const { id, search, origin, ifNoneMatch, range } = info;

    const media = await mediaService.get({ id });
    if (!media) {
        return new Response('Media not found', { status: 404 });
    }

    const storage = getStorageDriver();

    const params = parseImageParams(search);
    // Derive the extension from the stored record, never the URL path — the URL
    // ext is cosmetic and untrusted (path-traversal guard for the storage key).
    const ext = extOf(media.filename);
    const key = ext ? `${id}.${ext}` : id;

    // No image params — serve original
    if (params.width == null && params.format == null) {
        return serveOriginal({
            key,
            mimeType: media.mimeType,
            version: media.metadata?.version ?? null,
            storage,
            ifNoneMatch,
            range,
        });
    }

    const imageConfig = getImageConfig();

    // No image driver or non-optimisable type — serve original, ignore params
    if (!imageConfig || !isOptimisableImage(media.mimeType)) {
        return serveOriginal({
            key,
            mimeType: media.mimeType,
            version: media.metadata?.version ?? null,
            storage,
            ifNoneMatch,
            range,
        });
    }

    // Validate width
    if (params.width == null || !isAllowedWidth(params.width, imageConfig.widths)) {
        return new Response('Width not allowed', { status: 404 });
    }

    const version = media.metadata?.version;

    // No version — can't safely version a variant
    if (version == null) {
        return serveOriginal({
            key,
            mimeType: media.mimeType,
            version: null,
            storage,
            ifNoneMatch,
            range,
        });
    }

    const wantFormat: ImageFormat = params.format ?? (imageConfig.avif ? 'avif' : 'webp');

    // Missing format, missing version param, or stale version — redirect to canonical
    if (params.format == null || params.version == null || params.version !== version) {
        const location = buildVariantUrl(getConfig().mediaRoute, id, ext, {
            width: params.width,
            format: wantFormat,
            version,
        });
        return new Response(null, { status: 302, headers: { Location: location } });
    }

    // All valid: width in allowlist, format explicit, version correct — serve variant.
    // A `Range` header is deliberately ignored from here down: variants are images
    // and are served whole, and one may not exist yet (a cache miss transforms it
    // on the spot), so there is nothing stable to range over. Ranges are an
    // originals-only concern — see `serveOriginal`.
    const format = params.format;
    const vKey = variantStorageKey(id, version, params.width, format);
    const etag = `"${version}-${params.width}-${format}"`;
    const variantCacheControl = 'public, max-age=31536000, immutable';

    if (ifNoneMatch === etag) {
        // Echo the cache directives on the 304 (RFC 7234 §4.3.4) so the client
        // doesn't downgrade its cached entry's freshness.
        return new Response(null, {
            status: 304,
            headers: { 'Cache-Control': variantCacheControl, ETag: etag },
        });
    }

    const hit = await storage.get(vKey);
    if (hit) {
        return new Response(hit.body, {
            status: 200,
            headers: {
                'Content-Type': contentTypeForFormat(format),
                'Cache-Control': variantCacheControl,
                ETag: etag,
            },
        });
    }

    // Cache miss — transform
    const src: ImageSource = {
        contentType: media.mimeType,
        getBytes: async () => {
            const o = await storage.get(key);
            if (!o) throw new Error('original missing');
            return streamToBytes(o.body);
        },
        originUrl: `${origin}${buildMediaUrl(getConfig().mediaRoute, id, ext)}`,
    };

    const out = await imageConfig.driver.transform(src, { width: params.width, format });
    const bytes = await toBytes(out.body);

    if (!imageConfig.driver.cachesVariants) {
        await storage.put(vKey, bytes, { contentType: out.contentType });
    }

    return new Response(bytes as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': out.contentType,
            'Cache-Control': variantCacheControl,
            ETag: etag,
        },
    });
}

/** A single `bytes=` range: either an offset-anchored one or a suffix. */
type ByteRange = { start: number; end: number | null } | { suffix: number };

/**
 * Parse a single-range `Range` header.
 *
 * Returns null for everything we serve whole: an absent header, a unit other
 * than `bytes`, a malformed spec, and — deliberately — a multi-range request
 * (`bytes=0-99,200-299`). RFC 9110 lets a server ignore a `Range` it does not
 * support and answer 200 with the full representation, which is what a null
 * here means. Suffix ranges (`bytes=-500`, the last 500 bytes) ARE supported:
 * silently mis-serving one as `start=0` is the trap this shape avoids.
 */
function parseByteRange(header: string | null | undefined): ByteRange | null {
    if (typeof header !== 'string' || header === '') return null;

    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (rawStart === '') {
        // `bytes=-N` — the last N bytes. `bytes=-` is malformed.
        if (rawEnd === '') return null;
        return { suffix: Number(rawEnd) };
    }

    const start = Number(rawStart);
    if (rawEnd === '') return { start, end: null };

    const end = Number(rawEnd);
    // last-pos < first-pos is an invalid spec — ignore the whole field.
    if (end < start) return null;
    return { start, end };
}

/** Resolve a parsed range against the object's real size. */
function resolveRange(
    range: ByteRange,
    totalSize: number
): { offset: number; length: number } | null {
    if ('suffix' in range) {
        if (range.suffix <= 0) return null;
        const offset = Math.max(0, totalSize - range.suffix);
        const length = totalSize - offset;
        return length > 0 ? { offset, length } : null;
    }
    if (range.start >= totalSize) return null;
    const end = range.end === null ? totalSize - 1 : Math.min(range.end, totalSize - 1);
    return { offset: range.start, length: end - range.start + 1 };
}

type ServeOriginalInput = {
    key: string;
    mimeType: string;
    version: string | null;
    storage: StorageDriver;
    ifNoneMatch?: string | null | undefined;
    range?: string | null | undefined;
};

async function serveOriginal(input: ServeOriginalInput): Promise<Response> {
    const { key, mimeType, version, storage, ifNoneMatch } = input;
    const etag = version ? `"${version}"` : null;
    const cacheControl = 'public, max-age=300, must-revalidate';

    // Check the conditional request before touching storage — avoids opening a
    // read stream we'd immediately discard on a 304. This runs before any range
    // handling: a validated cache entry needs no bytes at all.
    if (etag && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: { 'Cache-Control': cacheControl, ETag: etag },
        });
    }

    const requested = parseByteRange(input.range);
    if (requested) {
        // `stat` first: the range has to be validated against the real size
        // before asking for it, and an unsatisfiable one must answer 416 with
        // the total — which we have no object to read it from.
        const stat = await storage.stat(key);
        if (!stat) {
            return new Response('Not found', { status: 404 });
        }

        const resolved = resolveRange(requested, stat.size);
        if (!resolved) {
            return new Response(null, {
                status: 416,
                headers: {
                    'Accept-Ranges': 'bytes',
                    'Content-Range': `bytes */${stat.size}`,
                    'Cache-Control': cacheControl,
                },
            });
        }

        const part = await storage.get(key, { range: resolved });
        if (!part) {
            return new Response('Not found', { status: 404 });
        }

        // `size` is the bytes in this body; `totalSize` is the whole object.
        const last = resolved.offset + part.size - 1;
        const headers: Record<string, string> = {
            'Content-Type': mimeType,
            'Content-Length': String(part.size),
            'Content-Range': `bytes ${resolved.offset}-${last}/${part.totalSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
        };
        if (etag) headers['ETag'] = etag;

        return new Response(part.body, { status: 206, headers });
    }

    const obj = await storage.get(key);
    if (!obj) {
        return new Response('Not found', { status: 404 });
    }

    const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': String(obj.size),
        // Advertised on a plain 200 too, so a video client knows it may seek.
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
    };
    if (etag) {
        headers['ETag'] = etag;
    }

    return new Response(obj.body, { status: 200, headers });
}
