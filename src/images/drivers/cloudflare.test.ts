import { describe, it, expect, vi, afterEach } from 'vitest';
import { cloudflareImages } from './cloudflare.js';

const ORIGIN_URL = 'https://example.com/image.jpg';

function makeFakeResponse(opts: { ok: boolean; contentType?: string }): Response {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
        },
    });
    return new Response(opts.ok ? stream : null, {
        status: opts.ok ? 200 : 500,
        headers: opts.contentType ? { 'content-type': opts.contentType } : {},
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('cloudflareImages()', () => {
    it('cachesVariants is true', () => {
        expect(cloudflareImages().cachesVariants).toBe(true);
    });

    describe('transform', () => {
        it('calls fetch once with the origin URL and correct cf.image options', async () => {
            const fakeResponse = makeFakeResponse({
                ok: true,
                contentType: 'image/webp',
            });
            const fetchSpy = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValue(fakeResponse);

            const driver = cloudflareImages();
            const src = {
                contentType: 'image/jpeg',
                getBytes: async () => new Uint8Array(),
                originUrl: ORIGIN_URL,
            };

            await driver.transform(src, { width: 640, format: 'webp' });

            expect(fetchSpy).toHaveBeenCalledOnce();
            const [firstArg, secondArg] = fetchSpy.mock.calls[0] as [
                string,
                { cf: { image: unknown } },
            ];
            expect(firstArg).toBe(ORIGIN_URL);
            expect((secondArg as { cf: { image: unknown } }).cf.image).toEqual({
                width: 640,
                format: 'webp',
            });
        });

        it('returns the response body and content-type header', async () => {
            const fakeResponse = makeFakeResponse({
                ok: true,
                contentType: 'image/webp',
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse);

            const driver = cloudflareImages();
            const src = {
                contentType: 'image/jpeg',
                getBytes: async () => new Uint8Array(),
                originUrl: ORIGIN_URL,
            };

            const result = await driver.transform(src, { width: 640, format: 'webp' });

            expect(result.body).toBe(fakeResponse.body);
            expect(result.contentType).toBe('image/webp');
        });

        it('falls back to format-derived content-type when header is absent', async () => {
            const fakeResponse = makeFakeResponse({ ok: true });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse);

            const driver = cloudflareImages();
            const src = {
                contentType: 'image/jpeg',
                getBytes: async () => new Uint8Array(),
                originUrl: ORIGIN_URL,
            };

            const result = await driver.transform(src, { width: 640, format: 'avif' });
            expect(result.contentType).toBe('image/avif');
        });

        it('throws when the response is not ok', async () => {
            const fakeResponse = makeFakeResponse({ ok: false });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse);

            const driver = cloudflareImages();
            const src = {
                contentType: 'image/jpeg',
                getBytes: async () => new Uint8Array(),
                originUrl: ORIGIN_URL,
            };

            await expect(
                driver.transform(src, { width: 640, format: 'webp' })
            ).rejects.toThrow('Cloudflare image transform failed: 500');
        });
    });
});
