import { mediaApi } from '@/services/media/service.js';
import { getStorageDriver } from '@/storage/registry.js';
import { getImageConfig } from '@/images/registry.js';
import {
    parseImageParams,
    isAllowedWidth,
    buildMediaUrl,
    buildVariantUrl,
    variantStorageKey,
} from '@/images/url.js';
import type { ImageFormat } from '@/images/url.js';
import { isOptimisableImage } from '@/images/dimensions.js';
import type { ImageSource } from '@/types/index.js';

export type MediaRequestInfo = {
    id: string;
    ext: string;
    search: URLSearchParams;
    origin: string;
    ifNoneMatch?: string | null;
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
    const { id, search, origin, ifNoneMatch } = info;

    const media = await mediaApi.get(id);
    if (!media) {
        return new Response('Media not found', { status: 404 });
    }

    const storage = getStorageDriver();
    if (!storage) {
        return new Response('Storage not configured', { status: 500 });
    }

    const params = parseImageParams(search);
    // Derive the extension from the stored record, never the URL path — the URL
    // ext is cosmetic and untrusted (path-traversal guard for the storage key).
    const ext = extOf(media.filename);
    const key = ext ? `${id}.${ext}` : id;

    // No image params — serve original
    if (params.width == null && params.format == null) {
        return serveOriginal(
            key,
            media.mimeType,
            media.metadata?.version ?? null,
            storage,
            ifNoneMatch
        );
    }

    const imageConfig = getImageConfig();

    // No image driver or non-optimisable type — serve original, ignore params
    if (!imageConfig || !isOptimisableImage(media.mimeType)) {
        return serveOriginal(
            key,
            media.mimeType,
            media.metadata?.version ?? null,
            storage,
            ifNoneMatch
        );
    }

    // Validate width
    if (params.width == null || !isAllowedWidth(params.width, imageConfig.widths)) {
        return new Response('Width not allowed', { status: 404 });
    }

    const version = media.metadata?.version;

    // No version — can't safely version a variant
    if (version == null) {
        return serveOriginal(key, media.mimeType, null, storage, ifNoneMatch);
    }

    const wantFormat: ImageFormat = params.format ?? (imageConfig.avif ? 'avif' : 'webp');

    // Missing format, missing version param, or stale version — redirect to canonical
    if (params.format == null || params.version == null || params.version !== version) {
        const location = buildVariantUrl(imageConfig.mediaRoute, id, ext, {
            width: params.width,
            format: wantFormat,
            version,
        });
        return new Response(null, { status: 302, headers: { Location: location } });
    }

    // All valid: width in allowlist, format explicit, version correct — serve variant
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
        originUrl: `${origin}${buildMediaUrl(imageConfig.mediaRoute, id, ext)}`,
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

async function serveOriginal(
    key: string,
    mimeType: string,
    version: string | null,
    storage: NonNullable<ReturnType<typeof getStorageDriver>>,
    ifNoneMatch?: string | null
): Promise<Response> {
    const etag = version ? `"${version}"` : null;
    const cacheControl = 'public, max-age=300, must-revalidate';

    // Check the conditional request before touching storage — avoids opening a
    // read stream we'd immediately discard on a 304.
    if (etag && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: { 'Cache-Control': cacheControl, ETag: etag },
        });
    }

    const obj = await storage.get(key);
    if (!obj) {
        return new Response('Not found', { status: 404 });
    }

    const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': String(obj.size),
        'Cache-Control': cacheControl,
    };
    if (etag) {
        headers['ETag'] = etag;
    }

    return new Response(obj.body, { status: 200, headers });
}
