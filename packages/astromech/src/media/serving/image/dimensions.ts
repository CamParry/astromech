/**
 * Image header dimension reader. Reads an image's displayed pixel dimensions
 * from its headers without decoding it, using Uint8Array and DataView only (no
 * Node Buffer APIs), so it runs on Cloudflare Workers.
 */

type Dimensions = { width: number; height: number };

/** EXIF and TIFF tag numbers this reader uses. */
const TAG_IMAGE_WIDTH = 0x0100;
const TAG_IMAGE_LENGTH = 0x0101;
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
 * Read an image's pixel dimensions as displayed, from its header bytes: an
 * orientation that turns the image a quarter turn (EXIF, or a HEIF `irot`)
 * swaps the stored width and height, as an upright variant does. Reads PNG,
 * GIF, JPEG, WebP, TIFF, and HEIF (HEIC and AVIF). Returns null if the format
 * is unrecognised or the header is too short to determine size.
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

    // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
    if (
        (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
        (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
    ) {
        return readTiff(view);
    }

    // HEIF (HEIC, AVIF): an ISO base media file opening with an ftyp box
    if (fourCC(view, 4) === 'ftyp') {
        return readHeif(view);
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

function readTiff(view: DataView): Dimensions | null {
    const tags = readTiffTags(view, 0);
    const width = tags.get(TAG_IMAGE_WIDTH);
    const height = tags.get(TAG_IMAGE_LENGTH);
    if (width == null || height == null) return null;
    return upright(width, height, tags.get(TAG_ORIENTATION));
}

/** One ISO base media box: its type and where its payload starts and ends. */
type Box = { type: string; start: number; end: number };

/** The boxes laid end to end between `start` and `end`. */
function readBoxes(view: DataView, start: number, end: number): Box[] {
    const boxes: Box[] = [];
    let offset = start;
    while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        let header = 8;
        if (size === 1) {
            // A 64-bit size follows the type.
            if (offset + 16 > end) break;
            size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
            header = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < header || offset + size > end) break;
        boxes.push({
            type: fourCC(view, offset + 4),
            start: offset + header,
            end: offset + size,
        });
        offset += size;
    }
    return boxes;
}

/** The first box of `type` among `boxes`. */
function findBox(boxes: Box[], type: string): Box | undefined {
    return boxes.find((box) => box.type === type);
}

/**
 * A HEIF file's primary image dimensions: its `ispe` property, turned by its
 * `irot` property. The primary item's own properties count, not the first
 * `ispe`, because a phone's HEIC stores a grid image over 512px tiles.
 */
function readHeif(view: DataView): Dimensions | null {
    const meta = findBox(readBoxes(view, 0, view.byteLength), 'meta');
    // meta, pitm, ipma, ispe and irot are full boxes: a version byte and 3 flag bytes first.
    if (!meta || meta.start + 4 > meta.end) return null;
    const metaBoxes = readBoxes(view, meta.start + 4, meta.end);
    const pitm = findBox(metaBoxes, 'pitm');
    const iprp = findBox(metaBoxes, 'iprp');
    if (!pitm || !iprp || pitm.start + 6 > pitm.end) return null;
    const primary =
        view.getUint8(pitm.start) === 0
            ? view.getUint16(pitm.start + 4)
            : view.getUint32(pitm.start + 4);

    const iprpBoxes = readBoxes(view, iprp.start, iprp.end);
    const ipco = findBox(iprpBoxes, 'ipco');
    if (!ipco) return null;
    const properties = readBoxes(view, ipco.start, ipco.end);
    const associated = iprpBoxes
        .filter((box) => box.type === 'ipma')
        .flatMap((ipma) => readPropertyIndexes(view, ipma, primary))
        .map((index) => properties[index - 1]);

    const ispe = associated.find((box) => box?.type === 'ispe');
    if (!ispe || ispe.start + 12 > ispe.end) return null;
    const width = view.getUint32(ispe.start + 4);
    const height = view.getUint32(ispe.start + 8);
    const irot = associated.find((box) => box?.type === 'irot');
    // irot's low two bits count quarter turns anticlockwise; an odd count swaps the axes.
    const quarterTurns =
        irot && irot.start < irot.end ? view.getUint8(irot.start) & 0x03 : 0;
    return quarterTurns % 2 === 1 ? { width: height, height: width } : { width, height };
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
