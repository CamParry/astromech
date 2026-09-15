/**
 * The media route as the composed app serves it: the security headers a media
 * response carries, the methods it answers, and a failure answered in plain
 * text rather than the API's JSON envelope.
 */

import type { AstromechConfig, MediaAccess, StorageDriver } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaService } from '@/app-context/services';
import { setImageConfig } from '@/media/serving/image/registry';
import { setStorageDriver } from '@/storage/registry';
import { createHttpApp } from '@/transport/http/app';

// Minimal 1x1 JPEG (SOI + APP0 + SOF0 + EOI).
const JPEG = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00,
    0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

/** An in-memory driver that honours byte ranges. */
function makeStorage(): StorageDriver {
    const store = new Map<string, Uint8Array>();
    return {
        name: 'memory',
        async put(key, body) {
            store.set(key, body instanceof Uint8Array ? body : new Uint8Array());
        },
        async get(key, opts) {
            const bytes = store.get(key);
            if (!bytes) return null;
            const offset = opts?.range?.offset ?? 0;
            const length = opts?.range?.length ?? bytes.length - offset;
            const slice = bytes.slice(offset, offset + length);
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(slice);
                    controller.close();
                },
            });
            return { body, size: slice.length, totalSize: bytes.length };
        },
        async stat(key) {
            const bytes = store.get(key);
            return bytes ? { size: bytes.length } : null;
        },
        async delete(key) {
            store.delete(key);
        },
        async list(prefix) {
            return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)) };
        },
    };
}

type Setup = {
    app: OpenAPIHono;
    api: string;
    storage: StorageDriver;
    mediaUrl: string;
    version: string;
};

/** Build the whole app over a fresh database holding one uploaded JPEG. */
async function setup(access: MediaAccess = 'public'): Promise<Setup> {
    await createTestDb();
    const base = makeTestConfig();
    const config: AstromechConfig = { ...base, media: { ...base.media, access } };
    const resolved = setupTestConfig(config);
    const storage = makeStorage();
    setStorageDriver(storage);

    const media = await mediaService.upload({
        file: new File([JPEG as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
    });

    return {
        app: createHttpApp(resolved) as unknown as OpenAPIHono,
        api: `${resolved.basePath}/api`,
        storage,
        mediaUrl: `${resolved.mediaRoute}/${media.id}.jpg`,
        version: media.metadata?.version ?? '',
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Cross-Origin-Resource-Policy', () => {
    it('is cross-origin on a media response under public access', async () => {
        const { app, mediaUrl } = await setup('public');
        const res = await app.request(mediaUrl);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    });

    it('is same-site on a media response under private access', async () => {
        const { app, mediaUrl } = await setup('private');
        const res = await app.request(mediaUrl);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-site');
    });

    it('stays same-origin on an API response', async () => {
        const { app, api } = await setup('public');
        const res = await app.request(`${api}/setup/check`);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    });

    it('keeps the shared security headers on a media response', async () => {
        const { app, mediaUrl } = await setup('public');
        const res = await app.request(mediaUrl);
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('X-Frame-Options')).toBe('DENY');
        expect(res.headers.get('Referrer-Policy')).toBe(
            'strict-origin-when-cross-origin'
        );
    });
});

describe('caching and range headers', () => {
    it('carries ETag, Accept-Ranges and Content-Length on a plain GET', async () => {
        const { app, mediaUrl, version } = await setup();
        const res = await app.request(mediaUrl);
        expect(res.status).toBe(200);
        expect(res.headers.get('ETag')).toBe(`"${version}"`);
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');
        expect(res.headers.get('Content-Length')).toBe(String(JPEG.length));
        expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=300, must-revalidate'
        );
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    });

    it('carries Content-Range on a ranged GET', async () => {
        const { app, mediaUrl } = await setup();
        const res = await app.request(mediaUrl, { headers: { Range: 'bytes=0-9' } });
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe(`bytes 0-9/${JPEG.length}`);
        expect(res.headers.get('Content-Length')).toBe('10');
    });

    it('carries the immutable Cache-Control on a canonical variant', async () => {
        const { app, mediaUrl, version } = await setup();
        setImageConfig({
            driver: {
                name: 'fake',
                cachesVariants: false,
                async transform(_src, opts) {
                    return {
                        body: new TextEncoder().encode('VARIANT'),
                        contentType: `image/${opts.format}`,
                    };
                },
            },
            widths: [320],
            avif: false,
        });

        const res = await app.request(`${mediaUrl}?w=320&f=webp&v=${version}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=31536000, immutable'
        );
        expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    });
});

describe('methods', () => {
    it('answers HEAD with the GET headers and an empty body', async () => {
        const { app, mediaUrl, version } = await setup();
        const res = await app.request(mediaUrl, { method: 'HEAD' });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        expect(res.headers.get('ETag')).toBe(`"${version}"`);
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');
        expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
        expect(await res.text()).toBe('');
    });

    it.each(['POST', 'PUT', 'DELETE'])('answers 405 for %s', async (method) => {
        const { app, mediaUrl } = await setup();
        const res = await app.request(mediaUrl, { method });
        expect(res.status).toBe(405);
        expect(res.headers.get('Allow')).toBe('GET, HEAD');
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
        expect(await res.text()).toBe('Method not allowed');
    });
});

describe('failures', () => {
    it('answers a plain-text 500 when storage throws, not the JSON envelope', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { app, mediaUrl, storage } = await setup();
        setStorageDriver({
            ...storage,
            async get() {
                throw new Error('storage unavailable');
            },
        });

        const res = await app.request(mediaUrl);
        expect(res.status).toBe(500);
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.text()).toBe('Internal server error');
        expect(errors).toHaveBeenCalledOnce();
    });
});
