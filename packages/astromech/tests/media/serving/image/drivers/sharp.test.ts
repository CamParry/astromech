import type { ImageSource } from '@/types/index';
import sharpLib from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { sharp } from '@/media/serving/image/drivers/sharp';

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

describe('sharp driver — canTransform', () => {
    it('accepts HEIC only when its libvips build can decode HEVC', async () => {
        // libvips lists the .heic suffix only when libheif has an HEVC decoder.
        const decodesHevc =
            sharpLib.format.heif.input.fileSuffix?.includes('.heic') ?? false;
        const driver = sharp();

        expect(await driver.canTransform?.('image/heic')).toBe(decodesHevc);
        expect(await driver.canTransform?.('image/heif')).toBe(decodesHevc);
    });

    it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'])(
        'accepts %s',
        async (type) => {
            expect(await sharp().canTransform?.(type)).toBe(true);
        }
    );
});

describe('sharp driver — cache key', () => {
    it('names the encoder and the quality of each format', () => {
        expect(sharp().cacheKey).toBe('sharp-avif50-webp78');
    });
});

// withoutEnlargement — never upscale

describe('sharp driver — withoutEnlargement', () => {
    it('does not upscale an 800px source to 2000px', async () => {
        const driver = sharp();
        const result = await driver.transform(src, { width: 2000, format: 'webp' });
        const meta = await sharpLib(Buffer.from(result.body as Uint8Array)).metadata();
        expect(meta.width).toBe(800);
    });
});

/** An 8×8 WebP of three frames: red, green, blue. */
async function animatedWebp(): Promise<Uint8Array> {
    const frame = (r: number, g: number, b: number) =>
        Array.from({ length: 64 }, () => [r, g, b, 255]).flat();
    const pixels = Buffer.from([
        ...frame(255, 0, 0),
        ...frame(0, 255, 0),
        ...frame(0, 0, 255),
    ]);
    const bytes = await sharpLib(pixels, {
        raw: { width: 8, height: 24, channels: 4, pageHeight: 8 },
    })
        .webp({ loop: 0, delay: [100, 100, 100] })
        .toBuffer();
    return new Uint8Array(bytes);
}

describe('sharp driver — animated source', () => {
    it('keeps every frame of an animated WebP in a WebP variant', async () => {
        const bytes = await animatedWebp();
        const animated: ImageSource = {
            contentType: 'image/webp',
            originUrl: '',
            getBytes: () => Promise.resolve(bytes),
        };

        const result = await sharp().transform(animated, { width: 4, format: 'webp' });

        const meta = await sharpLib(Buffer.from(result.body as Uint8Array), {
            animated: true,
        }).metadata();
        expect({
            pages: meta.pages,
            width: meta.width,
            pageHeight: meta.pageHeight,
        }).toEqual({
            pages: 3,
            width: 4,
            pageHeight: 4,
        });
    });

    it('makes an AVIF variant of the first frame, not a strip of every frame', async () => {
        const bytes = await animatedWebp();
        const animated: ImageSource = {
            contentType: 'image/webp',
            originUrl: '',
            getBytes: () => Promise.resolve(bytes),
        };

        const result = await sharp().transform(animated, { width: 4, format: 'avif' });

        const meta = await sharpLib(Buffer.from(result.body as Uint8Array)).metadata();
        expect({ width: meta.width, height: meta.height }).toEqual({
            width: 4,
            height: 4,
        });
    });
});

describe('sharp driver — placeholder', () => {
    it('returns a non-empty blurhash string', async () => {
        const driver = sharp();
        expect(driver.placeholder).toBeDefined();
        const hash = await driver.placeholder?.(sourceBytes);
        expect(typeof hash).toBe('string');
        expect((hash as string).length).toBeGreaterThan(0);
    });

    it('hashes a photo upright when its EXIF orientation rotates it', async () => {
        // Black on the left, white on the right, tagged "rotate 90 degrees clockwise".
        const half = await sharpLib({
            create: { width: 20, height: 20, channels: 3, background: '#000000' },
        })
            .png()
            .toBuffer();
        const stored = await sharpLib({
            create: { width: 40, height: 20, channels: 3, background: '#ffffff' },
        })
            .composite([{ input: half, left: 0, top: 0 }])
            .jpeg()
            .withMetadata({ orientation: 6 })
            .toBuffer();
        const upright = await sharpLib(stored).rotate().png().toBuffer();

        const driver = sharp();
        expect(await driver.placeholder?.(new Uint8Array(stored))).toBe(
            await driver.placeholder?.(new Uint8Array(upright))
        );
    });

    // 32px is hashed as it is; 64px is scaled down first, which blackens hidden colour.
    it.each([32, 64])(
        'hashes transparent pixels as white, not as the colour they hide (%ipx)',
        async (size) => {
            const square = await sharpLib({
                create: { width: 8, height: 8, channels: 4, background: '#808080ff' },
            })
                .png()
                .toBuffer();
            const withBorder = (background: string) =>
                sharpLib({
                    create: { width: size, height: size, channels: 4, background },
                })
                    .composite([{ input: square, left: size / 4, top: size / 4 }])
                    .png()
                    .toBuffer();
            const transparent = await withBorder('#ff000000');
            const white = await withBorder('#ffffffff');

            const driver = sharp();
            expect(await driver.placeholder?.(new Uint8Array(transparent))).toBe(
                await driver.placeholder?.(new Uint8Array(white))
            );
        }
    );
});
