/**
 * Media access modes — `Media.url` resolution (spec §8.1–8.2).
 *
 * `toMedia` is the one place a media URL is produced, so it is the one place
 * the `media.access` policy is applied. These tests pin both directions of the
 * policy and the driver feature-detection fallback that keeps `filesystem()`
 * and a `publicUrl`-less `r2()` working unchanged.
 */

import { describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig, makeTestConfig } from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { mediaApi } from '@/media/service.js';
import { buildImageAttrs } from '@/media/serving/image/build-image-attrs.js';
import type { AstromechConfig, MediaAccess, StorageDriver } from '@/types/index.js';

// Minimal 1x1 JPEG (SOI + APP0 + SOF0 + EOI) — an optimisable raster image.
function jpegBytes(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
        0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
}

/** `publicUrl: null` models a driver with no public URL (filesystem, plain r2). */
function makeStorage(publicUrl: 'cdn' | null): StorageDriver {
    const store = new Map<string, Uint8Array>();
    const driver: StorageDriver = {
        name: 'memory',
        async put(key, body) {
            store.set(key, body instanceof Uint8Array ? body : new Uint8Array());
        },
        async get(key) {
            const bytes = store.get(key);
            if (!bytes) return null;
            const body = new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(bytes);
                    c.close();
                },
            });
            return { body, size: bytes.length, totalSize: bytes.length };
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
    if (publicUrl === 'cdn') {
        driver.getPublicUrl = (key: string): string => `https://cdn.example/${key}`;
    }
    return driver;
}

async function setup(
    access: MediaAccess | undefined,
    publicUrl: 'cdn' | null
): Promise<void> {
    await createTestDb();
    const base = makeTestConfig();
    const config: AstromechConfig = {
        ...base,
        ...(access === undefined ? {} : { media: { ...base.media, access } }),
    };
    setupTestConfig(config);
    setStorageDriver(makeStorage(publicUrl));
}

async function uploadJpeg(): Promise<{ id: string; url: string }> {
    const media = await mediaApi.upload({
        file: new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
    });
    return { id: media.id, url: media.url };
}

describe('media access mode → Media.url', () => {
    it("access 'public' + a driver with a public URL → the direct driver URL", async () => {
        await setup('public', 'cdn');
        const { id, url } = await uploadJpeg();
        expect(url).toBe(`https://cdn.example/${id}.jpg`);
    });

    it("access 'public' + a driver without one → falls back to the media route", async () => {
        await setup('public', null);
        const { id, url } = await uploadJpeg();
        expect(url).toBe(`/_media/${id}.jpg`);
    });

    it("access 'private' → the media route even when the driver offers a public URL", async () => {
        await setup('private', 'cdn');
        const { id, url } = await uploadJpeg();
        expect(url).toBe(`/_media/${id}.jpg`);
    });

    it("defaults to 'public' when access is unset", async () => {
        await setup(undefined, 'cdn');
        const { id, url } = await uploadJpeg();
        expect(url).toBe(`https://cdn.example/${id}.jpg`);
    });

    it('applies to reads as well as the upload response', async () => {
        await setup('public', 'cdn');
        const { id } = await uploadJpeg();
        const fetched = await mediaApi.get({ id: id });
        const listed = await mediaApi.query({ limit: 'all' });
        expect(fetched?.url).toBe(`https://cdn.example/${id}.jpg`);
        expect(listed.data[0]?.url).toBe(`https://cdn.example/${id}.jpg`);
    });
});

describe('media access mode → image attrs', () => {
    it("keeps srcset variants on the media route under access 'public'", async () => {
        await setup('public', 'cdn');
        const { id, url } = await uploadJpeg();
        const media = await mediaApi.get({ id: id });

        const attrs = buildImageAttrs(
            {
                id,
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                width: 1600,
                height: 900,
                version: media?.metadata?.version ?? null,
                url,
            },
            {},
            { mediaRoute: '/_media', widths: [320, 640], avif: true }
        );

        // The bare original honours the access mode…
        expect(attrs.img.src).toBe(`https://cdn.example/${id}.jpg`);
        // …but every variant stays on the media route, which generates it on demand.
        expect(attrs.sources.length).toBeGreaterThan(0);
        for (const source of attrs.sources) {
            for (const candidate of source.srcset.split(', ')) {
                expect(candidate.startsWith(`/_media/${id}.jpg?`)).toBe(true);
            }
        }
    });
});
