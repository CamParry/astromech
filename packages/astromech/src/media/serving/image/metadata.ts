/**
 * Reads what an image's header says about its pixels beyond their size, as the
 * media row's metadata records it. DataView only, so it runs on Workers.
 */

import type { ImageFormat } from './header';
import {
    boxType,
    detectImageFormat,
    findBox,
    firstIfdOffset,
    fourCC,
    readBoxes,
    readIfdEntries,
    readPngChunks,
    readTiffHeader,
} from './header';

/** The keys `readImageMetadata` reads; each is absent when the header does not say. */
export type ImageMetadata = { hasAlpha?: boolean; animated?: boolean };

/** TIFF's ExtraSamples tag, present when a pixel has a sample beyond its colour, such as alpha. */
const TAG_EXTRA_SAMPLES = 0x0152;

/** HEIF box types this reader uses. */
const META = boxType('meta');
const IPRP = boxType('iprp');
const IPCO = boxType('ipco');
const AUXC = boxType('auxC');

/** The `auxC` types that mark an auxiliary image as an alpha plane, for AVIF and for HEIC. */
const ALPHA_AUX_TYPES = new Set([
    'urn:mpeg:mpegB:cicp:systems:auxiliary:alpha',
    'urn:mpeg:hevc:2015:auxid:1',
]);

/**
 * Whether a PNG, JPEG, WebP, TIFF or HEIF image has an alpha channel, and
 * whether a WebP is animated, read from its header. Empty for a malformed file.
 */
export function readImageMetadata(bytes: Uint8Array): ImageMetadata {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const format = detectImageFormat(bytes);
    const hasAlpha = attempt(() => readHasAlpha(format, view));
    const animated = attempt(() =>
        format === 'webp' ? readWebpAnimated(view) : undefined
    );
    return {
        ...(hasAlpha === undefined ? {} : { hasAlpha }),
        ...(animated === undefined ? {} : { animated }),
    };
}

/** The bytes are an untrusted upload: a read the checks miss gives nothing, not a throw. */
function attempt(read: () => boolean | undefined): boolean | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

function readHasAlpha(format: ImageFormat | null, view: DataView): boolean | undefined {
    switch (format) {
        case 'png':
            return readPngHasAlpha(view);
        case 'jpeg':
            return false;
        case 'webp':
            return readWebpHasAlpha(view);
        case 'tiff':
            return readTiffHasAlpha(view);
        case 'heif':
            return readHeifHasAlpha(view);
        case 'gif':
        case null:
            return undefined;
    }
}

/** Only an extended WebP can be animated, and its flags say whether it is. */
function readWebpAnimated(view: DataView): boolean | undefined {
    if (view.byteLength < 16) return undefined;
    const chunk = fourCC(view, 12);
    if (chunk === 'VP8 ' || chunk === 'VP8L') return false;
    if (chunk === 'VP8X' && view.byteLength >= 21)
        return (view.getUint8(20) & 0x02) !== 0;
    return undefined;
}

/** Grey or truecolour with alpha (colour types 4 and 6), or a `tRNS` chunk before the image data. */
function readPngHasAlpha(view: DataView): boolean | undefined {
    if (view.byteLength < 26) return undefined;
    const colourType = view.getUint8(25);
    if (colourType === 4 || colourType === 6) return true;
    for (const chunk of readPngChunks(view)) {
        if (chunk.type === 'IDAT') return false;
        if (chunk.type === 'tRNS') return true;
    }
    return undefined;
}

/** A lossy WebP has none; a lossless one says so in its header; an extended one in its flags. */
function readWebpHasAlpha(view: DataView): boolean | undefined {
    if (view.byteLength < 16) return undefined;
    const chunk = fourCC(view, 12);
    if (chunk === 'VP8 ') return false;
    // After the 0x2f signature: 14 bits of width, 14 of height, then the alpha bit.
    if (chunk === 'VP8L' && view.byteLength >= 25) {
        return ((view.getUint32(21, true) >>> 28) & 1) === 1;
    }
    if (chunk === 'VP8X' && view.byteLength >= 21) {
        return (view.getUint8(20) & 0x10) !== 0;
    }
    return undefined;
}

/** An ExtraSamples tag in the first IFD, which libvips reads as alpha. */
function readTiffHasAlpha(view: DataView): boolean | undefined {
    const tiff = readTiffHeader(view, 0, view.byteLength);
    if (!tiff) return undefined;
    return readIfdEntries(view, tiff, firstIfdOffset(view, tiff)).some(
        (entry) => entry.tag === TAG_EXTRA_SAMPLES
    );
}

/** Any `auxC` property naming an alpha plane, which only an image with alpha carries. */
function readHeifHasAlpha(view: DataView): boolean | undefined {
    const meta = findBox(view, 0, view.byteLength, META);
    if (!meta || meta.start + 4 > meta.end) return undefined;
    const iprp = findBox(view, meta.start + 4, meta.end, IPRP);
    const ipco = iprp && findBox(view, iprp.start, iprp.end, IPCO);
    if (!ipco) return undefined;
    for (const box of readBoxes(view, ipco.start, ipco.end)) {
        // auxC is a full box: a version byte and 3 flag bytes, then a null-terminated URN.
        if (
            box.type === AUXC &&
            ALPHA_AUX_TYPES.has(readCString(view, box.start + 4, box.end))
        )
            return true;
    }
    return false;
}

/** The ASCII string at `start`, up to its null byte or `end`. */
function readCString(view: DataView, start: number, end: number): string {
    let text = '';
    for (let offset = start; offset < Math.min(end, view.byteLength); offset++) {
        const code = view.getUint8(offset);
        if (code === 0) break;
        text += String.fromCharCode(code);
    }
    return text;
}
