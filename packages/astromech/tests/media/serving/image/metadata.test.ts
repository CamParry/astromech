import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharpLib from 'sharp';
import { describe, expect, it } from 'vitest';
import { readImageMetadata } from '@/media/serving/image/metadata';

/** A 4×4 image with an alpha channel, transparent or opaque, as sharp encodes it in `format`. */
async function encode(
    format: 'png' | 'jpeg' | 'webp' | 'avif' | 'tiff',
    opts: { alpha: boolean; options?: Record<string, unknown> }
): Promise<Uint8Array> {
    const bytes = await sharpLib({
        create: {
            width: 4,
            height: 4,
            channels: opts.alpha ? 4 : 3,
            background: opts.alpha ? '#80808080' : '#808080',
        },
    })
        .toFormat(format, opts.options)
        .toBuffer();
    return new Uint8Array(bytes);
}

describe('readImageMetadata — hasAlpha', () => {
    it.each([
        ['a truecolour PNG with alpha', 'png', true, {}],
        ['a truecolour PNG', 'png', false, {}],
        ['a palette PNG with a transparent colour', 'png', true, { palette: true }],
        ['a palette PNG', 'png', false, { palette: true }],
        ['a lossy WebP with alpha', 'webp', true, {}],
        ['a lossy WebP', 'webp', false, {}],
        ['a lossless WebP with alpha', 'webp', true, { lossless: true }],
        ['a lossless WebP', 'webp', false, { lossless: true }],
        ['an AVIF with alpha', 'avif', true, {}],
        ['an AVIF', 'avif', false, {}],
        ['a TIFF with alpha', 'tiff', true, { compression: 'lzw' }],
        ['a TIFF', 'tiff', false, { compression: 'lzw' }],
    ] as const)('reads %s', async (_, format, alpha, options) => {
        const bytes = await encode(format, { alpha, options });
        expect(readImageMetadata(bytes).hasAlpha).toBe(alpha);
    });

    it('reads a JPEG as opaque', async () => {
        expect(readImageMetadata(await encode('jpeg', { alpha: false }))).toEqual({
            hasAlpha: false,
        });
    });

    it('reads a HEIC with no alpha plane as opaque', async () => {
        const bytes = await readFile(
            join(import.meta.dirname, 'fixtures', 'grid-1200x800.heic')
        );
        expect(readImageMetadata(new Uint8Array(bytes))).toEqual({ hasAlpha: false });
    });

    it('says nothing about a GIF or a file it cannot read', async () => {
        const gif = await sharpLib({
            create: { width: 4, height: 4, channels: 4, background: '#80808000' },
        })
            .gif()
            .toBuffer();
        expect(readImageMetadata(new Uint8Array(gif))).toEqual({});
        expect(readImageMetadata(new TextEncoder().encode('not an image'))).toEqual({});
    });
});

describe('readImageMetadata — animated', () => {
    it('reads an animated WebP as animated', async () => {
        // Three 8×8 frames: black, grey, white.
        const pixels = Buffer.concat(
            [0, 0x80, 0xff].map((v) => Buffer.alloc(8 * 8 * 4, v))
        );
        const bytes = await sharpLib(pixels, {
            raw: { width: 8, height: 24, channels: 4, pageHeight: 8 },
        })
            .webp({ loop: 0, delay: [100, 100, 100] })
            .toBuffer();

        expect(readImageMetadata(new Uint8Array(bytes)).animated).toBe(true);
    });

    it.each([
        ['a lossy WebP', { alpha: false }],
        ['a lossless WebP', { alpha: false, options: { lossless: true } }],
        ['an extended WebP', { alpha: true }],
    ])('reads %s as still', async (_, opts) => {
        expect(readImageMetadata(await encode('webp', opts)).animated).toBe(false);
    });

    it('says nothing about animation in another format', async () => {
        expect(readImageMetadata(await encode('png', { alpha: true }))).toEqual({
            hasAlpha: true,
        });
    });
});
