import type { ImageFormat } from '@/media/serving/image/url';
import type { ImageDriver, ImageSource, StorageDriver } from '@/types/index';
import {
    createTestDb,
    createTestStorage,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { handleMediaRequest } from '@/media/serving/handler';

const mediaService = currentServices.media;

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

const VARIANT_BYTES = new TextEncoder().encode('VARIANT');

function makeFakeImageDriver() {
    const calls: { width: number; format: ImageFormat }[] = [];
    const originUrls: string[] = [];
    const driver: ImageDriver = {
        name: 'fake',
        cachesVariants: false,
        async transform(src: ImageSource, opts: { width: number; format: ImageFormat }) {
            calls.push({ width: opts.width, format: opts.format });
            originUrls.push(src.originUrl);
            return { body: VARIANT_BYTES, contentType: `image/${opts.format}` };
        },
    };
    return { driver, calls, originUrls };
}

let storage: StorageDriver;
let fakeDriver: ReturnType<typeof makeFakeImageDriver>;

beforeEach(async () => {
    await createTestDb();
    storage = createTestStorage();
    fakeDriver = makeFakeImageDriver();
    setupTestConfig({
        ...makeTestConfig(),
        storage,
        media: { image: { driver: fakeDriver.driver, widths: [320, 640], avif: true } },
    });
});

async function readBody(res: Response): Promise<Uint8Array> {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

describe('handleMediaRequest', () => {
    it('1. no params → 200 original bytes', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });

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
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
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
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
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
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
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
        const vKey = `variants/${media.id}/${version}/fake/320.webp`;
        expect(await storage.stat(vKey)).not.toBeNull();
    });

    it('hands the driver an origin URL that carries the version and serves the original', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
        const version = media.metadata?.version ?? '';

        await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams({ w: '320', f: 'webp', v: version }),
            origin: 'http://x',
        });

        expect(fakeDriver.originUrls).toEqual([
            `http://x/_media/${media.id}.jpg?v=${version}`,
        ]);
        const origin = new URL(fakeDriver.originUrls[0] ?? '');
        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: origin.searchParams,
            origin: 'http://x',
        });
        expect(res.status).toBe(200);
        expect(await readBody(res)).toEqual(jpegBytes);
    });

    it('6. valid variant cache hit → 200, transform NOT called again', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
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

    it('makes a new variant, under a new ETag, when the driver’s cache key changes', async () => {
        const media = await mediaService.upload({
            file: new File([makeJpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        const version = media.metadata?.version ?? '';
        const search = new URLSearchParams({ w: '320', f: 'webp', v: version });
        const request = { id: media.id, ext: 'jpg', search, origin: 'http://x' };
        const first = await handleMediaRequest(request);
        await readBody(first);

        const requality = makeFakeImageDriver();
        setupTestConfig({
            ...makeTestConfig(),
            storage,
            media: {
                image: {
                    driver: { ...requality.driver, cacheKey: 'fake-q90' },
                    widths: [320, 640],
                    avif: true,
                },
            },
        });
        const second = await handleMediaRequest(request);

        expect(requality.calls).toEqual([{ width: 320, format: 'webp' }]);
        expect(first.headers.get('ETag')).toBe(`"${version}-320-webp-fake"`);
        expect(second.headers.get('ETag')).toBe(`"${version}-320-webp-fake-q90"`);
        expect(
            await storage.stat(`variants/${media.id}/${version}/fake-q90/320.webp`)
        ).not.toBeNull();
    });

    it('7. non-optimisable type → serves original, transform not called', async () => {
        const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake content');
        const media = await mediaService.upload({
            file: new File([pdfBytes as BlobPart], 'document.pdf', {
                type: 'application/pdf',
            }),
        });
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
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });

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

const CLIP = 'abcdefghijklmnopqrstuvwxyz'; // 26 bytes

async function uploadClip(): Promise<string> {
    const media = await mediaService.upload({
        file: new File([new TextEncoder().encode(CLIP) as BlobPart], 'clip.mp4', {
            type: 'video/mp4',
        }),
    });
    return media.id;
}

async function requestClip(range?: string): Promise<Response> {
    const id = await uploadClip();
    return handleMediaRequest({
        id,
        ext: 'mp4',
        search: new URLSearchParams(),
        origin: 'http://x',
        ...(range === undefined ? {} : { range }),
    });
}

describe('handleMediaRequest — range requests', () => {
    it('advertises Accept-Ranges on a plain 200', async () => {
        const res = await requestClip();
        expect(res.status).toBe(200);
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');
        expect(res.headers.get('Content-Range')).toBeNull();
        expect(await res.text()).toBe(CLIP);
    });

    it('a satisfiable range → 206 with Content-Range and Content-Length', async () => {
        const res = await requestClip('bytes=0-9');
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe('bytes 0-9/26');
        expect(res.headers.get('Content-Length')).toBe('10');
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');
        expect(res.headers.get('Content-Type')).toBe('video/mp4');
        expect(await res.text()).toBe('abcdefghij');
    });

    it('an open-ended range runs to the end of the object', async () => {
        const res = await requestClip('bytes=10-');
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe('bytes 10-25/26');
        expect(res.headers.get('Content-Length')).toBe('16');
        expect(await res.text()).toBe('klmnopqrstuvwxyz');
    });

    it('clamps an end past the last byte', async () => {
        const res = await requestClip('bytes=20-100');
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe('bytes 20-25/26');
        expect(await res.text()).toBe('uvwxyz');
    });

    it('a suffix range serves the last N bytes (never byte 0)', async () => {
        const res = await requestClip('bytes=-5');
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe('bytes 21-25/26');
        expect(await res.text()).toBe('vwxyz');
    });

    it('a suffix longer than the object serves the whole object as 206', async () => {
        const res = await requestClip('bytes=-100');
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Range')).toBe('bytes 0-25/26');
        expect(await res.text()).toBe(CLIP);
    });

    it('a zero-length suffix is unsatisfiable → 416', async () => {
        const res = await requestClip('bytes=-0');
        expect(res.status).toBe(416);
        expect(res.headers.get('Content-Range')).toBe('bytes */26');
    });

    it('a start past the end → 416 with the total and no body', async () => {
        const res = await requestClip('bytes=100-200');
        expect(res.status).toBe(416);
        expect(res.headers.get('Content-Range')).toBe('bytes */26');
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');
        expect(await res.text()).toBe('');
    });

    it('ignores a multi-range request and serves the whole object with 200', async () => {
        const res = await requestClip('bytes=0-9,20-25');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Range')).toBeNull();
        expect(await res.text()).toBe(CLIP);
    });

    it('ignores a malformed or non-bytes range and serves 200', async () => {
        for (const header of ['bytes=abc', 'items=0-9', 'bytes=9-0', 'bytes=-', '']) {
            const res = await requestClip(header);
            expect(res.status).toBe(200);
            expect(await res.text()).toBe(CLIP);
        }
    });

    it('the 304 short-circuit wins over a range header', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
        const etag = `"${media.metadata?.version ?? ''}"`;

        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams(),
            origin: 'http://x',
            ifNoneMatch: etag,
            range: 'bytes=0-9',
        });

        expect(res.status).toBe(304);
        expect(res.headers.get('Content-Range')).toBeNull();
    });

    it('ignores a range on a variant request — variants are served whole', async () => {
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
        const version = media.metadata?.version ?? '';

        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams({ w: '320', f: 'webp', v: version }),
            origin: 'http://x',
            range: 'bytes=0-1',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Range')).toBeNull();
        expect(await readBody(res)).toEqual(VARIANT_BYTES);
    });
});

describe('handleMediaRequest failures', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('serves the original under its own cache headers when the transform throws', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(fakeDriver.driver, 'transform').mockRejectedValue(
            new Error('corrupt image')
        );
        const jpegBytes = makeJpegBytes();
        const media = await mediaService.upload({
            file: new File([jpegBytes as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
        });
        const version = media.metadata?.version ?? '';

        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams({ w: '320', f: 'webp', v: version }),
            origin: 'http://x',
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=300, must-revalidate'
        );
        expect(res.headers.get('ETag')).toBe(`"${version}"`);
        expect(await readBody(res)).toEqual(jpegBytes);
        expect((await storage.list('variants/')).keys).toEqual([]);
        expect(errors).toHaveBeenCalledOnce();
    });

    it('answers a plain-text 500 with no-store when storage throws', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const media = await mediaService.upload({
            file: new File([makeJpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        vi.spyOn(storage, 'get').mockRejectedValue(new Error('storage unavailable'));

        const res = await handleMediaRequest({
            id: media.id,
            ext: 'jpg',
            search: new URLSearchParams(),
            origin: 'http://x',
        });

        expect(res.status).toBe(500);
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.text()).toBe('Internal server error');
        expect(errors).toHaveBeenCalledOnce();
    });
});
