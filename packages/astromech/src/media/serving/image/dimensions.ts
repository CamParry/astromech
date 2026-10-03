/**
 * Image header dimension reader. Reads an image's displayed pixel dimensions
 * from its headers without decoding it, using Uint8Array and DataView only (no
 * Node Buffer APIs), so it runs on Cloudflare Workers.
 */

type Dimensions = { width: number; height: number };

/** The EXIF orientation tag. */
const TAG_ORIENTATION = 0x0112;

/** True only for raster bitmap types we can optimise (transform). Excludes svg, gif, video, pdf, etc. */
export function isOptimisableImage(mimeType: string): boolean {
    const normalised = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
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

/**
 * Read an image's pixel dimensions as displayed, from its header bytes: an EXIF
 * orientation that turns the image a quarter turn swaps the stored width and
 * height, as an upright variant does. Returns null if the format is
 * unrecognised or the header is too short to determine size.
 */
export function readImageDimensions(bytes: Uint8Array): Dimensions | null {
    if (bytes.length < 8) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PNG: signature 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return readPng(view);
    }

    // GIF: GIF87a or GIF89a
    if (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
    ) {
        return readGif(view);
    }

    // JPEG: FF D8
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return readJpeg(view);
    }

    // WebP: RIFF....WEBP
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return readWebp(view);
    }

    return null;
}

/** The dimensions shown once EXIF `orientation` is applied: 5 to 8 turn the image a quarter turn. */
function upright(
    width: number,
    height: number,
    orientation: number | undefined
): Dimensions {
    return orientation != null && orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
}

/** The four ASCII characters at `offset`. */
function fourCC(view: DataView, offset: number): string {
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
    );
}

/** Whether the six bytes at `offset` are the EXIF identifier `Exif\0\0`. */
function isExifIdentifier(view: DataView, offset: number): boolean {
    return (
        offset + 6 <= view.byteLength &&
        fourCC(view, offset) === 'Exif' &&
        view.getUint16(offset + 4) === 0
    );
}

/**
 * The single-valued SHORT and LONG tags of the first IFD in the TIFF structure
 * at `start` (a TIFF file, or the EXIF block inside a JPEG, PNG or WebP).
 * Returns an empty map when the structure is malformed.
 */
function readTiffTags(view: DataView, start: number): Map<number, number> {
    const tags = new Map<number, number>();
    if (start + 8 > view.byteLength) return tags;
    const order = view.getUint16(start);
    if (order !== 0x4949 && order !== 0x4d4d) return tags;
    const le = order === 0x4949;
    if (view.getUint16(start + 2, le) !== 42) return tags;

    const ifd = start + view.getUint32(start + 4, le);
    if (ifd + 2 > view.byteLength) return tags;
    const count = view.getUint16(ifd, le);
    for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.byteLength) break;
        const type = view.getUint16(entry + 2, le);
        if (view.getUint32(entry + 4, le) !== 1) continue;
        // SHORT is 3 and LONG is 4; a single value sits in the entry itself.
        if (type === 3)
            tags.set(view.getUint16(entry, le), view.getUint16(entry + 8, le));
        if (type === 4)
            tags.set(view.getUint16(entry, le), view.getUint32(entry + 8, le));
    }
    return tags;
}

/** The orientation in an EXIF block at `start`, which may open with `Exif\0\0`. */
function readExifOrientation(view: DataView, start: number): number | undefined {
    const tiff = isExifIdentifier(view, start) ? start + 6 : start;
    return readTiffTags(view, tiff).get(TAG_ORIENTATION);
}

function readPng(view: DataView): Dimensions | null {
    // IHDR chunk starts at offset 8; width at 16, height at 20
    if (view.byteLength < 24) return null;
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);

    // Chunks follow IHDR: length (4), type (4), data, CRC (4). EXIF lives in eXIf.
    let orientation: number | undefined;
    let offset = 8;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset);
        const type = fourCC(view, offset + 4);
        if (type === 'eXIf') orientation = readExifOrientation(view, offset + 8);
        if (type === 'IEND' || type === 'eXIf') break;
        offset += 12 + length;
    }
    return upright(width, height, orientation);
}

function readGif(view: DataView): Dimensions | null {
    // width at offset 6, height at offset 8, both LE uint16
    if (view.byteLength < 10) return null;
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    return { width, height };
}

function readJpeg(view: DataView): Dimensions | null {
    let offset = 2; // skip FF D8
    let orientation: number | undefined;

    while (offset + 3 < view.byteLength) {
        // Skip padding FF bytes
        if (view.getUint8(offset) !== 0xff) return null;
        offset += 1;

        let marker = view.getUint8(offset);
        offset += 1;

        // Skip any additional padding FF bytes
        while (marker === 0xff) {
            if (offset >= view.byteLength) return null;
            marker = view.getUint8(offset);
            offset += 1;
        }

        // SOF markers: C0–CF except C4 (DHT), C8 (JPEGext), CC (DAC)
        if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
        ) {
            // offset points right after the marker byte: segment length (2 bytes),
            // precision (1 byte), height (2 bytes), then width (2 bytes)
            if (offset + 7 > view.byteLength) return null;
            const height = view.getUint16(offset + 3, false);
            const width = view.getUint16(offset + 5, false);
            return upright(width, height, orientation);
        }

        // Read segment length to skip (length includes the 2 length bytes itself)
        if (offset + 1 >= view.byteLength) return null;
        const segLength = view.getUint16(offset, false);
        if (segLength < 2) return null;
        // APP1 holds EXIF, after the identifier `Exif\0\0`.
        if (marker === 0xe1 && isExifIdentifier(view, offset + 2)) {
            orientation = readExifOrientation(view, offset + 2);
        }
        offset += segLength;
    }

    return null;
}

function readWebp(view: DataView): Dimensions | null {
    if (view.byteLength < 16) return null;

    // Chunk fourCC at offset 12
    const c0 = view.getUint8(12);
    const c1 = view.getUint8(13);
    const c2 = view.getUint8(14);
    const c3 = view.getUint8(15);

    // VP8 (lossy): 'VP8 ' = 56 50 38 20
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x20) {
        if (view.byteLength < 30) return null;
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        return { width, height };
    }

    // VP8L (lossless): 'VP8L' = 56 50 38 4C
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x4c) {
        if (view.byteLength < 25) return null;
        const bits = view.getUint32(21, true);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
    }

    // VP8X (extended): 'VP8X' = 56 50 38 58
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x58) {
        if (view.byteLength < 30) return null;
        // LE uint24 at offset 24 and 27
        const width =
            view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
        const height =
            view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
        return upright(width + 1, height + 1, readWebpOrientation(view));
    }

    return null;
}

/** The orientation in an extended WebP's EXIF chunk, which follows the image data. */
function readWebpOrientation(view: DataView): number | undefined {
    // Chunks from offset 12: fourCC (4), size (4, LE), data padded to an even length.
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
        const size = view.getUint32(offset + 4, true);
        if (fourCC(view, offset) === 'EXIF') return readExifOrientation(view, offset + 8);
        offset += 8 + size + (size % 2);
    }
    return undefined;
}
