import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig, makeTestConfig } from '@/test/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setImageConfig } from '@/images/registry.js';
import { mediaApi } from '@/sdk/local/media.js';
import { handleMediaRequest } from '@/images/handler.js';
import type { StorageDriver, ImageDriver, ImageSource } from '@/types/index.js';
import type { ImageFormat } from '@/images/url.js';

// ---------------------------------------------------------------------------
// Minimal JPEG header bytes (SOF0 marker with 1x1 dimensions)
// ---------------------------------------------------------------------------
function makeJpegBytes(): Uint8Array {
    // Minimal valid JPEG: SOI + APP0 + SOF0 + EOI
    return new Uint8Array([
        0xff,
        0xd8, // SOI
        0xff,
        0xe0, // APP0 marker
        0x00,
        0x10, // APP0 length 16
        0x4a,
        0x46,
        0x49,
        0x46,
        0x00, // JFIF\0
        0x01,
        0x01, // version 1.1
        0x00, // aspect units
        0x00,
        0x01,
        0x00,
        0x01, // X/Y density
        0x00,
        0x00, // thumbnail size
        0xff,
        0xc0, // SOF0 marker
        0x00,
        0x0b, // SOF0 length 11
        0x08, // precision 8
        0x00,
        0x01, // height 1
        0x00,
        0x01, // width 1
        0x01, // components 1
        0x01,
        0x11,
        0x00, // component data
        0xff,
        0xd9, // EOI
    ]);
}

// ---------------------------------------------------------------------------
// In-memory fake StorageDriver
// ---------------------------------------------------------------------------
function makeMemoryStorage(): StorageDriver {
    const store = new Map<string, Uint8Array>();
    return {
        name: 'memory',
        async put(key, body, _opts) {
            const bytes =
                body instanceof Uint8Array
                    ? body
                    : await (async () => {
                          const reader = (body as ReadableStream).getReader();
                          const chunks: Uint8Array[] = [];
                          while (true) {
                              const { done, value } = await reader.read();
                              if (done) break;
                              chunks.push(value);
                          }
                          const total = chunks.reduce((n, c) => n + c.length, 0);
                          const out = new Uint8Array(total);
                          let offset = 0;
                          for (const c of chunks) {
                              out.set(c, offset);
                              offset += c.length;
                          }
                          return out;
                      })();
            store.set(key, bytes);
        },
        async get(key) {
            const bytes = store.get(key);
            if (!bytes) return null;
            let pos = 0;
            const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (pos < bytes.length) {
                        controller.enqueue(bytes.slice(pos));
                        pos = bytes.length;
                    }
                    controller.close();
                },
            });
            return { body, size: bytes.length };
        },
        async delete(key) {
            store.delete(key);
        },
        async list(prefix) {
            return [...store.keys()].filter((k) => k.startsWith(prefix));
        },
        getDirectUrl: () => null,
        // expose store for assertions
        _store: store,
    } as StorageDriver & { _store: Map<string, Uint8Array> };
}

// ---------------------------------------------------------------------------
// Fake ImageDriver
// ---------------------------------------------------------------------------
const VARIANT_BYTES = new TextEncoder().encode('VARIANT');

function makeFakeImageDriver() {
    const calls: { width: number; format: ImageFormat }[] = [];
    const driver: ImageDriver = {
        name: 'fake',
        cachesVariants: false,
        async transform(_src: ImageSource, opts: { width: number; format: ImageFormat }) {
            calls.push({ width: opts.width, format: opts.format });
            return { body: VARIANT_BYTES, contentType: `image/${opts.format}` };
        },
    };
    return { driver, calls };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let storage: ReturnType<typeof makeMemoryStorage> & { _store: Map<string, Uint8Array> };
let fakeDriver: ReturnType<typeof makeFakeImageDriver>;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());

    storage = makeMemoryStorage() as ReturnType<typeof makeMemoryStorage> & {
        _store: Map<string, Uint8Array>;
    };
    setStorageDriver(storage);

    fakeDriver = makeFakeImageDriver();
    setImageConfig({
        driver: fakeDriver.driver,
        widths: [320, 640],
        avif: true,
        mediaRoute: '/_media',
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readBody(res: Response): Promise<Uint8Array> {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMediaRequest', () => {
    it('1. no params → 200 original bytes', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );

        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams(),
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        const body = await readBody(res);
        expect(body).toEqual(jpegBytes);
    });

    it('2. unknown id → 404', async () => {
        const res = await handleMediaRequest({
            id: 'nonexistent-id',
            ext: 'jpg',
            search: new URLSearchParams(),
            origin: 'http://x',
        });

        expect(res.status).toBe(404);
    });

    it('3. disallowed width → 404', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        const version = media.metadata?.version ?? '';

        const search = new URLSearchParams({ w: '999', f: 'webp', v: version });
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search,
            origin: 'http://x',
        });

        expect(res.status).toBe(404);
    });

    it('4. valid width + format but missing version → 302 with correct params', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        const version = media.metadata?.version ?? '';

        // Request with w and f but no v
        const search = new URLSearchParams({ w: '320', f: 'webp' });
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search,
            origin: 'http://x',
        });

        expect(res.status).toBe(302);
        const location = res.headers.get('Location') ?? '';
        expect(location).toContain('w=320');
        expect(location).toContain('f=webp');
        expect(location).toContain(`v=${version}`);
    });

    it('5. valid variant cache miss → 200, immutable, body=VARIANT, transform called once, variant stored', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        const version = media.metadata?.version ?? '';

        const search = new URLSearchParams({ w: '320', f: 'webp', v: version });
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search,
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toContain('immutable');
        const body = await readBody(res);
        expect(body).toEqual(VARIANT_BYTES);

        expect(fakeDriver.calls).toHaveLength(1);
        expect(fakeDriver.calls[0]).toEqual({ width: 320, format: 'webp' });

        // Variant was written back to storage
        const vKey = `variants/${media.id}/${version}/320.webp`;
        expect(
            (storage as unknown as { _store: Map<string, Uint8Array> })._store.has(vKey)
        ).toBe(true);
    });

    it('6. valid variant cache hit → 200, transform NOT called again', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        const version = media.metadata?.version ?? '';
        const search = new URLSearchParams({ w: '320', f: 'webp', v: version });

        // First request — populates cache
        await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search,
            origin: 'http://x',
        });

        const callsBefore = fakeDriver.calls.length;

        // Second request — should hit cache
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search,
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        const body = await readBody(res);
        expect(body).toEqual(VARIANT_BYTES);
        // No new transform calls
        expect(fakeDriver.calls.length).toBe(callsBefore);
    });

    it('7. non-optimisable type → serves original, transform not called', async () => {
        const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake content');
        const media = await mediaApi.upload(
            new File([pdfBytes as BlobPart], 'document.pdf', { type: 'application/pdf' })
        );
        const version = media.metadata?.version ?? '';

        const search = new URLSearchParams({ w: '320', f: 'webp', v: version });
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'pdf',
            search,
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(fakeDriver.calls).toHaveLength(0);
    });

    it('8. ignores the URL extension — storage key derives from the record (traversal guard)', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaApi.upload(
            new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );

        // A malicious / mismatched URL ext must NOT influence the storage key:
        // the original is keyed by `${id}.jpg` (from media.filename), so it still
        // serves correctly and never builds a key from attacker-controlled input.
        const res = await handleMediaRequest({
            id: media.id,
            ext: '../../../etc/passwd',
            search: new URLSearchParams(),
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        const body = await readBody(res);
        expect(body).toEqual(jpegBytes);
    });
});
