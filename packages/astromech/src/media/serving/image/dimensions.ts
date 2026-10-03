/**
 * Image header dimension reader. Reads an image's displayed pixel dimensions
 * from its headers without decoding it, using Uint8Array and DataView only (no
 * Node Buffer APIs), so it runs on Cloudflare Workers.
 */

import type { Box, Tiff } from './header';
import {
    boxType,
    detectImageFormat,
    findBox,
    firstIfdOffset,
    fourCC,
    isExifIdentifier,
    readBoxes,
    readIfdEntries,
    readIfdNumber,
    readJpegSegments,
    readPngChunks,
    readTiffHeader,
    readWebpChunks,
} from './header';

type Dimensions = { width: number; height: number };

/** EXIF and TIFF tag numbers this reader uses. */
const TAG_IMAGE_WIDTH = 0x0100;
const TAG_IMAGE_LENGTH = 0x0101;
const TAG_ORIENTATION = 0x0112;

/** HEIF box types this reader uses. */
const META = boxType('meta');
const PITM = boxType('pitm');
const IPRP = boxType('iprp');
const IPCO = boxType('ipco');
const IPMA = boxType('ipma');
const ISPE = boxType('ispe');
const CLAP = boxType('clap');
const IROT = boxType('irot');

/** True only for raster bitmap types we can optimise (transform). Excludes svg, gif, video, pdf, etc. */
export function isOptimisableImage(mimeType: string): boolean {
    const normalised = normaliseMimeType(mimeType);
    return (
        normalised === 'image/jpeg' ||
        normalised === 'image/png' ||
        normalised === 'image/webp' ||
        normalised === 'image/avif' ||
        normalised === 'image/heic' ||
        normalised === 'image/heif' ||
        normalised === 'image/tiff'
    );
}

/** True for the image types whose dimensions `readImageDimensions` reads: the optimisable ones and GIF. */
export function isReadableImage(mimeType: string): boolean {
    return isOptimisableImage(mimeType) || normaliseMimeType(mimeType) === 'image/gif';
}

/**
 * Read an image's pixel dimensions as displayed, from its header bytes: an
 * orientation that turns the image a quarter turn (EXIF, or a HEIF `irot`)
 * swaps the stored width and height, as an upright variant does. Reads PNG,
 * GIF, JPEG, WebP, TIFF, and HEIF (HEIC and AVIF). Returns null if the format
 * is unrecognised, the header is too short to determine size, or it is malformed.
 */
export function readImageDimensions(bytes: Uint8Array): Dimensions | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // The bytes are an untrusted upload: a read the checks below miss gives null, not a throw.
    try {
        switch (detectImageFormat(bytes)) {
            case 'png':
                return readPng(view);
            case 'gif':
                return readGif(view);
            case 'jpeg':
                return readJpeg(view);
            case 'webp':
                return readWebp(view);
            case 'tiff':
                return readTiff(view);
            case 'heif':
                return readHeif(view);
            case null:
                return null;
        }
    } catch {
        return null;
    }
}

function normaliseMimeType(mimeType: string): string {
    return (mimeType.split(';')[0] ?? '').trim().toLowerCase();
}

/** The dimensions shown once EXIF `orientation` is applied: 5 to 8 turn the image a quarter turn. */
function applyOrientation(
    width: number,
    height: number,
    orientation: number | undefined
): Dimensions {
    return orientation !== undefined && orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
}

/**
 * The single-valued SHORT and LONG tags of the first IFD in a TIFF structure.
 * Returns an empty map when the structure is malformed.
 */
function readTiffTags(view: DataView, tiff: Tiff): Map<number, number> {
    const tags = new Map<number, number>();
    for (const entry of readIfdEntries(view, tiff, firstIfdOffset(view, tiff))) {
        const value = readIfdNumber(view, tiff, entry);
        if (value !== undefined) tags.set(entry.tag, value);
    }
    return tags;
}

/** The orientation in an EXIF block between `start` and `end`, which may open with `Exif\0\0`. */
function readExifOrientation(
    view: DataView,
    start: number,
    end: number
): number | undefined {
    const tiff = readTiffHeader(
        view,
        isExifIdentifier(view, start) ? start + 6 : start,
        end
    );
    return tiff ? readTiffTags(view, tiff).get(TAG_ORIENTATION) : undefined;
}

function readPng(view: DataView): Dimensions | null {
    // IHDR chunk starts at offset 8; width at 16, height at 20
    if (view.byteLength < 24) return null;
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);

    // EXIF lives in eXIf. One after the image data is ignored, as sharp ignores it.
    let orientation: number | undefined;
    for (const chunk of readPngChunks(view)) {
        if (chunk.type === 'IDAT') break;
        if (chunk.type === 'eXIf') {
            orientation = readExifOrientation(view, chunk.start, chunk.end);
            break;
        }
    }
    return applyOrientation(width, height, orientation);
}

function readGif(view: DataView): Dimensions | null {
    // width at offset 6, height at offset 8, both LE uint16
    if (view.byteLength < 10) return null;
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    return { width, height };
}

function readJpeg(view: DataView): Dimensions | null {
    let orientation: number | undefined;
    for (const { marker, start, end } of readJpegSegments(view)) {
        // SOF markers: C0–CF except C4 (DHT), C8 (JPEGext), CC (DAC)
        if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
        ) {
            // The payload holds precision (1 byte), height (2 bytes), then width (2 bytes).
            if (start + 5 > view.byteLength) return null;
            const height = view.getUint16(start + 1, false);
            const width = view.getUint16(start + 3, false);
            return applyOrientation(width, height, orientation);
        }
        // APP1 holds EXIF, after the identifier `Exif\0\0`.
        if (marker === 0xe1 && isExifIdentifier(view, start)) {
            orientation = readExifOrientation(view, start, end);
        }
    }
    return null;
}

function readWebp(view: DataView): Dimensions | null {
    if (view.byteLength < 16) return null;

    // Chunk fourCC at offset 12
    const chunk = fourCC(view, 12);

    // VP8 (lossy)
    if (chunk === 'VP8 ') {
        if (view.byteLength < 30) return null;
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        return { width, height };
    }

    // VP8L (lossless)
    if (chunk === 'VP8L') {
        if (view.byteLength < 25) return null;
        const bits = view.getUint32(21, true);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
    }

    // VP8X (extended)
    if (chunk === 'VP8X') {
        if (view.byteLength < 30) return null;
        // LE uint24 at offset 24 and 27
        const width =
            view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
        const height =
            view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
        // An EXIF chunk counts only when the VP8X flags announce it, as sharp reads it.
        const hasExif = (view.getUint8(20) & 0x08) !== 0;
        const orientation = hasExif ? readWebpOrientation(view) : undefined;
        return applyOrientation(width + 1, height + 1, orientation);
    }

    return null;
}

/** The orientation in an extended WebP's EXIF chunk, which follows the image data. */
function readWebpOrientation(view: DataView): number | undefined {
    for (const chunk of readWebpChunks(view)) {
        if (chunk.type === 'EXIF')
            return readExifOrientation(view, chunk.start, chunk.end);
    }
    return undefined;
}

function readTiff(view: DataView): Dimensions | null {
    const tiff = readTiffHeader(view, 0, view.byteLength);
    if (!tiff) return null;
    const tags = readTiffTags(view, tiff);
    const width = tags.get(TAG_IMAGE_WIDTH);
    const height = tags.get(TAG_IMAGE_LENGTH);
    if (width === undefined || height === undefined) return null;
    return applyOrientation(width, height, tags.get(TAG_ORIENTATION));
}

/**
 * A HEIF file's primary image dimensions: its `ispe` property, cropped by its
 * `clap` property and turned by its `irot` property. The primary item's own
 * properties count, not the first `ispe`, because a phone's HEIC stores a grid
 * image over 512px tiles.
 */
function readHeif(view: DataView): Dimensions | null {
    const meta = findBox(view, 0, view.byteLength, META);
    // meta, pitm, ipma and ispe are full boxes: a version byte and 3 flag bytes first.
    if (!meta || meta.start + 4 > meta.end) return null;
    const pitm = findBox(view, meta.start + 4, meta.end, PITM);
    const iprp = findBox(view, meta.start + 4, meta.end, IPRP);
    if (!pitm || !iprp || pitm.start + 4 > pitm.end) return null;
    // Version 0 stores the primary item id in 2 bytes, later versions in 4.
    const version = view.getUint8(pitm.start);
    if (pitm.start + (version === 0 ? 6 : 8) > pitm.end) return null;
    const primary =
        version === 0 ? view.getUint16(pitm.start + 4) : view.getUint32(pitm.start + 4);

    const ipco = findBox(view, iprp.start, iprp.end, IPCO);
    if (!ipco) return null;
    const indexes: number[] = [];
    for (const box of readBoxes(view, iprp.start, iprp.end)) {
        if (box.type === IPMA) indexes.push(...readPropertyIndexes(view, box, primary));
    }
    const properties = readAssociatedProperties(view, ipco, indexes);

    const ispe = properties.find((box) => box.type === ISPE);
    if (!ispe || ispe.start + 12 > ispe.end) return null;
    let width = view.getUint32(ispe.start + 4);
    let height = view.getUint32(ispe.start + 8);
    const clap = properties.find((box) => box.type === CLAP);
    if (clap && clap.start + 16 <= clap.end) {
        const cropped = {
            width: cleanApertureSize(view, clap.start, width),
            height: cleanApertureSize(view, clap.start + 8, height),
        };
        // A zero denominator makes the box invalid, so libheif ignores all of it.
        if (cropped.width !== null && cropped.height !== null) {
            width = cropped.width;
            height = cropped.height;
        }
    }
    const irot = properties.find((box) => box.type === IROT);
    // irot's low two bits count quarter turns anticlockwise; an odd count swaps the axes.
    const quarterTurns =
        irot && irot.start < irot.end ? view.getUint8(irot.start) & 0x03 : 0;
    return quarterTurns % 2 === 1 ? { width: height, height: width } : { width, height };
}

/**
 * The clean aperture size whose fraction is at `offset`, rounded half up as
 * libheif rounds it and no larger than `size`, or null when its denominator is 0.
 */
function cleanApertureSize(view: DataView, offset: number, size: number): number | null {
    const numerator = view.getUint32(offset);
    const denominator = view.getUint32(offset + 4);
    if (denominator === 0) return null;
    const rounded = Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
    return Math.min(Math.max(rounded, 1), size);
}

/** The `ipco` properties at the 1-based `indexes`, read no further than the last of them. */
function readAssociatedProperties(view: DataView, ipco: Box, indexes: number[]): Box[] {
    if (indexes.length === 0) return [];
    const wanted = new Set(indexes);
    const properties: Box[] = [];
    let index = 0;
    for (const box of readBoxes(view, ipco.start, ipco.end, Math.max(...wanted))) {
        index += 1;
        if (wanted.has(index)) properties.push(box);
    }
    return properties;
}

/** The 1-based `ipco` indexes an `ipma` box associates with item `itemId`. */
function readPropertyIndexes(view: DataView, ipma: Box, itemId: number): number[] {
    if (ipma.start + 8 > ipma.end) return [];
    const version = view.getUint8(ipma.start);
    const wideIndexes = (view.getUint8(ipma.start + 3) & 1) === 1;
    const entryCount = view.getUint32(ipma.start + 4);
    let offset = ipma.start + 8;
    for (let entry = 0; entry < entryCount; entry++) {
        const idSize = version === 0 ? 2 : 4;
        if (offset + idSize + 1 > ipma.end) return [];
        const id = version === 0 ? view.getUint16(offset) : view.getUint32(offset);
        const count = view.getUint8(offset + idSize);
        offset += idSize + 1;
        const indexSize = wideIndexes ? 2 : 1;
        if (offset + count * indexSize > ipma.end) return [];
        if (id === itemId) {
            // The top bit of each association marks it essential; the rest is the index.
            return Array.from({ length: count }, (_, i) =>
                wideIndexes
                    ? view.getUint16(offset + i * 2) & 0x7fff
                    : view.getUint8(offset + i) & 0x7f
            );
        }
        offset += count * indexSize;
    }
    return [];
}
