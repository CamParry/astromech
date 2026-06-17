import { describe, it, expect } from 'vitest';
import { isOptimisableImage, readImageDimensions } from '@/images/dimensions.js';

// ---------------------------------------------------------------------------
// isOptimisableImage
// ---------------------------------------------------------------------------

describe('isOptimisableImage', () => {
    it('returns true for jpeg', () =>
        expect(isOptimisableImage('image/jpeg')).toBe(true));
    it('returns true for png', () => expect(isOptimisableImage('image/png')).toBe(true));
    it('returns true for webp', () =>
        expect(isOptimisableImage('image/webp')).toBe(true));
    it('returns true for avif', () =>
        expect(isOptimisableImage('image/avif')).toBe(true));
    it('returns true for heic', () =>
        expect(isOptimisableImage('image/heic')).toBe(true));
    it('returns true for heif', () =>
        expect(isOptimisableImage('image/heif')).toBe(true));
    it('returns true for tiff', () =>
        expect(isOptimisableImage('image/tiff')).toBe(true));

    it('returns false for svg', () =>
        expect(isOptimisableImage('image/svg+xml')).toBe(false));
    it('returns false for gif', () =>
        expect(isOptimisableImage('image/gif')).toBe(false));
    it('returns false for video/mp4', () =>
        expect(isOptimisableImage('video/mp4')).toBe(false));
    it('returns false for application/pdf', () =>
        expect(isOptimisableImage('application/pdf')).toBe(false));

    it('is case-insensitive', () => expect(isOptimisableImage('Image/JPEG')).toBe(true));
    it('ignores charset suffix', () =>
        expect(isOptimisableImage('image/png; charset=utf-8')).toBe(true));
});

// ---------------------------------------------------------------------------
// Helpers to build minimal headers
// ---------------------------------------------------------------------------

/** Build a minimal PNG header with the given dimensions. */
function makePng(width: number, height: number): Uint8Array {
    // PNG signature (8) + IHDR length (4) + 'IHDR' (4) + width (4) + height (4) = 24 bytes
    const buf = new Uint8Array(24);
    const view = new DataView(buf.buffer);
    // Signature
    buf[0] = 0x89;
    buf[1] = 0x50;
    buf[2] = 0x4e;
    buf[3] = 0x47;
    buf[4] = 0x0d;
    buf[5] = 0x0a;
    buf[6] = 0x1a;
    buf[7] = 0x0a;
    // IHDR chunk length (13 bytes of data) at offset 8
    view.setUint32(8, 13, false);
    // 'IHDR' at offset 12
    buf[12] = 0x49;
    buf[13] = 0x48;
    buf[14] = 0x44;
    buf[15] = 0x52;
    // Width at offset 16, height at offset 20
    view.setUint32(16, width, false);
    view.setUint32(20, height, false);
    return buf;
}

/** Build a minimal GIF header with the given dimensions. */
function makeGif(width: number, height: number): Uint8Array {
    // GIF89a (6) + width LE uint16 (2) + height LE uint16 (2) = 10 bytes
    const buf = new Uint8Array(10);
    const view = new DataView(buf.buffer);
    // GIF89a
    buf[0] = 0x47;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x38;
    buf[4] = 0x39;
    buf[5] = 0x61;
    view.setUint16(6, width, true);
    view.setUint16(8, height, true);
    return buf;
}

/**
 * Build a minimal JPEG with a SOF0 segment carrying the given dimensions.
 * Layout: FF D8 | FF E0 APP0 (len=16, minimal) | FF C0 SOF0 | FF D9 EOI
 *
 * SOF0 payload: length(2) precision(1) height(2) width(2) components(1) = 8 bytes
 * segment length field = 8 (includes itself) + 1 = 9 bytes? No:
 *   segment length = 2(len field) + 1(precision) + 2(height) + 2(width) + 1(ncomp) = 8
 */
function makeJpeg(width: number, height: number): Uint8Array {
    const buf = new Uint8Array(
        2 + // FF D8
            4 + // FF E0 + length (2) — minimal APP0 to test skip
            14 + // APP0 payload (length=16, total segment = 2+14=16)
            2 + // FF C0 marker
            8 + // SOF0 segment payload (length=8 includes itself)
            2 // FF D9 EOI
    );
    const view = new DataView(buf.buffer);
    let off = 0;

    // SOI
    buf[off++] = 0xff;
    buf[off++] = 0xd8;

    // APP0 segment: FF E0, length = 16 (2 byte len + 14 bytes payload)
    buf[off++] = 0xff;
    buf[off++] = 0xe0;
    view.setUint16(off, 16, false);
    off += 2;
    off += 14; // skip APP0 payload

    // SOF0: FF C0
    buf[off++] = 0xff;
    buf[off++] = 0xc0;
    // Segment length = 2 (len field) + 1 (precision) + 2 (height) + 2 (width) + 1 (ncomp) = 8
    view.setUint16(off, 8, false);
    off += 2;
    buf[off++] = 0x08; // precision
    view.setUint16(off, height, false);
    off += 2;
    view.setUint16(off, width, false);
    off += 2;
    buf[off++] = 0x03; // number of components

    // EOI
    buf[off] = 0xff;
    buf[off + 1] = 0xd9;

    return buf;
}

/** Build a minimal WebP VP8 (lossy) header. */
function makeWebpVP8(width: number, height: number): Uint8Array {
    // Need at least 30 bytes
    const buf = new Uint8Array(30);
    const view = new DataView(buf.buffer);
    // RIFF
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    view.setUint32(4, buf.length - 8, true); // file size - 8
    // WEBP
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    // VP8 (with trailing space)
    buf[12] = 0x56;
    buf[13] = 0x50;
    buf[14] = 0x38;
    buf[15] = 0x20;
    // VP8 chunk size at 16
    view.setUint32(16, 10, true);
    // VP8 bitstream frame tag at 20 (3 bytes — not validated)
    buf[20] = 0x00;
    buf[21] = 0x00;
    buf[22] = 0x00;
    // Start code at 23 (3 bytes — not validated here)
    buf[23] = 0x9d;
    buf[24] = 0x01;
    buf[25] = 0x2a;
    // Width (LE uint16, mask 0x3FFF) at offset 26; height at 28
    view.setUint16(26, width & 0x3fff, true);
    view.setUint16(28, height & 0x3fff, true);
    return buf;
}

/** Build a minimal WebP VP8L (lossless) header. */
function makeWebpVP8L(width: number, height: number): Uint8Array {
    // Need at least 25 bytes
    const buf = new Uint8Array(25);
    const view = new DataView(buf.buffer);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    view.setUint32(4, buf.length - 8, true);
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    // VP8L
    buf[12] = 0x56;
    buf[13] = 0x50;
    buf[14] = 0x38;
    buf[15] = 0x4c;
    view.setUint32(16, 5, true); // chunk size
    buf[20] = 0x2f; // VP8L signature byte
    // LE uint32 at offset 21: bits[0..13] = width-1, bits[14..27] = height-1
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    view.setUint32(21, bits, true);
    return buf;
}

/** Build a minimal WebP VP8X (extended) header. */
function makeWebpVP8X(width: number, height: number): Uint8Array {
    // Need at least 30 bytes
    const buf = new Uint8Array(30);
    const view = new DataView(buf.buffer);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    view.setUint32(4, buf.length - 8, true);
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    // VP8X
    buf[12] = 0x56;
    buf[13] = 0x50;
    buf[14] = 0x38;
    buf[15] = 0x58;
    view.setUint32(16, 10, true); // chunk size = 10
    // flags at 20 (4 bytes)
    view.setUint32(20, 0, true);
    // LE uint24 canvas width minus 1 at offset 24, height minus 1 at offset 27
    const w = width - 1;
    const h = height - 1;
    buf[24] = w & 0xff;
    buf[25] = (w >> 8) & 0xff;
    buf[26] = (w >> 16) & 0xff;
    buf[27] = h & 0xff;
    buf[28] = (h >> 8) & 0xff;
    buf[29] = (h >> 16) & 0xff;
    return buf;
}

// ---------------------------------------------------------------------------
// readImageDimensions
// ---------------------------------------------------------------------------

describe('readImageDimensions', () => {
    it('returns null for empty buffer', () => {
        expect(readImageDimensions(new Uint8Array(0))).toBeNull();
    });

    it('returns null for random/unknown bytes', () => {
        const junk = new Uint8Array([
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        ]);
        expect(readImageDimensions(junk)).toBeNull();
    });

    describe('PNG', () => {
        it('reads 800x600', () => {
            expect(readImageDimensions(makePng(800, 600))).toEqual({
                width: 800,
                height: 600,
            });
        });
        it('reads 1920x1080', () => {
            expect(readImageDimensions(makePng(1920, 1080))).toEqual({
                width: 1920,
                height: 1080,
            });
        });
        it('returns null when too short', () => {
            expect(readImageDimensions(makePng(100, 100).slice(0, 10))).toBeNull();
        });
    });

    describe('GIF', () => {
        it('reads 320x240', () => {
            expect(readImageDimensions(makeGif(320, 240))).toEqual({
                width: 320,
                height: 240,
            });
        });
        it('reads GIF87a variant', () => {
            const buf = makeGif(100, 200);
            buf[4] = 0x37; // GIF87a
            expect(readImageDimensions(buf)).toEqual({ width: 100, height: 200 });
        });
    });

    describe('JPEG', () => {
        it('reads 640x480', () => {
            expect(readImageDimensions(makeJpeg(640, 480))).toEqual({
                width: 640,
                height: 480,
            });
        });
        it('reads 1280x720', () => {
            expect(readImageDimensions(makeJpeg(1280, 720))).toEqual({
                width: 1280,
                height: 720,
            });
        });
        it('returns null for truncated JPEG', () => {
            expect(readImageDimensions(makeJpeg(100, 100).slice(0, 4))).toBeNull();
        });
    });

    describe('WebP VP8 (lossy)', () => {
        it('reads 512x384', () => {
            expect(readImageDimensions(makeWebpVP8(512, 384))).toEqual({
                width: 512,
                height: 384,
            });
        });
        it('reads 1024x768', () => {
            expect(readImageDimensions(makeWebpVP8(1024, 768))).toEqual({
                width: 1024,
                height: 768,
            });
        });
    });

    describe('WebP VP8L (lossless)', () => {
        it('reads 400x300', () => {
            expect(readImageDimensions(makeWebpVP8L(400, 300))).toEqual({
                width: 400,
                height: 300,
            });
        });
        it('reads 1920x1080', () => {
            expect(readImageDimensions(makeWebpVP8L(1920, 1080))).toEqual({
                width: 1920,
                height: 1080,
            });
        });
    });

    describe('WebP VP8X (extended)', () => {
        it('reads 800x600', () => {
            expect(readImageDimensions(makeWebpVP8X(800, 600))).toEqual({
                width: 800,
                height: 600,
            });
        });
        it('reads 2048x1536', () => {
            expect(readImageDimensions(makeWebpVP8X(2048, 1536))).toEqual({
                width: 2048,
                height: 1536,
            });
        });
    });
});
