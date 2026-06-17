import { describe, it, expect, beforeAll } from 'vitest';
import sharpLib from 'sharp';
import { sharp } from '@/images/drivers/sharp.js';
import type { ImageSource } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

let sourceBytes: Uint8Array;
let src: ImageSource;

beforeAll(async () => {
    const buf = await sharpLib({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 10, g: 20, b: 30 },
        },
    })
        .png()
        .toBuffer();

    sourceBytes = new Uint8Array(buf);
    src = {
        contentType: 'image/png',
        originUrl: '',
        getBytes: () => Promise.resolve(sourceBytes),
    };
});

// ---------------------------------------------------------------------------
// transform — webp
// ---------------------------------------------------------------------------

describe('sharp driver — transform webp', () => {
    it('returns contentType image/webp', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'webp' });
        expect(result.contentType).toBe('image/webp');
    });

    it('returns a non-empty Uint8Array body', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'webp' });
        expect(result.body).toBeInstanceOf(Uint8Array);
        expect((result.body as Uint8Array).length).toBeGreaterThan(0);
    });

    it('output decodes to width 320 and format webp', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'webp' });
        const meta = await sharpLib(Buffer.from(result.body as Uint8Array)).metadata();
        expect(meta.width).toBe(320);
        expect(meta.format).toBe('webp');
    });
});

// ---------------------------------------------------------------------------
// transform — avif
// ---------------------------------------------------------------------------

describe('sharp driver — transform avif', () => {
    it('returns contentType image/avif', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'avif' });
        expect(result.contentType).toBe('image/avif');
    });

    it('returns a non-empty Uint8Array body', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'avif' });
        expect(result.body).toBeInstanceOf(Uint8Array);
        expect((result.body as Uint8Array).length).toBeGreaterThan(0);
    });

    it('output decodes to width 320 and format heif (avif)', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 320, format: 'avif' });
        const meta = await sharpLib(Buffer.from(result.body as Uint8Array)).metadata();
        expect(meta.width).toBe(320);
        // sharp reports avif files as heif
        expect(meta.format).toBe('heif');
    });
});

// ---------------------------------------------------------------------------
// withoutEnlargement — never upscale
// ---------------------------------------------------------------------------

describe('sharp driver — withoutEnlargement', () => {
    it('does not upscale an 800px source to 2000px', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 2000, format: 'webp' });
        const meta = await sharpLib(Buffer.from(result.body as Uint8Array)).metadata();
        expect(meta.width).toBe(800);
    });
});

// ---------------------------------------------------------------------------
// placeholder
// ---------------------------------------------------------------------------

describe('sharp driver — placeholder', () => {
    it('returns a non-empty blurhash string', async () => {
        const driver = sharp();
        expect(driver.placeholder).toBeDefined();
        const hash = await driver.placeholder?.(sourceBytes);
        expect(typeof hash).toBe('string');
        expect((hash as string).length).toBeGreaterThan(0);
    });
});
