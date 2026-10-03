/**
 * Walks over the structures of an image file's header: PNG chunks, JPEG marker
 * segments, WebP chunks, TIFF IFDs and ISO base media boxes. DataView only (no
 * Node Buffer APIs), so they run on Cloudflare Workers.
 */

/** The image container formats the header readers parse. */
export type ImageFormat = 'png' | 'gif' | 'jpeg' | 'webp' | 'tiff' | 'heif';

/** A PNG or WebP chunk, or a JPEG segment: its type and where its payload starts and ends. */
export type Chunk = { type: string; start: number; end: number };

/** A JPEG marker segment: its marker byte and where its payload starts and ends. */
export type Segment = { marker: number; start: number; end: number };

/** An ISO base media box: its type as a big-endian uint32, and where its payload starts and ends. */
export type Box = { type: number; start: number; end: number };

/** A TIFF structure: where its header starts, where its bytes end, and its byte order. */
export type Tiff = { start: number; end: number; littleEndian: boolean };

/** One 12-byte IFD entry: where it sits, its tag, value type and value count. */
export type IfdEntry = { offset: number; tag: number; type: number; count: number };

/** The most boxes read at one level of an ISO base media file before giving up. */
const MAX_BOXES = 64;

/** The container format `bytes` opens with, or null when it is none of these. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
    if (bytes.length < 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const head = fourCC(view, 0);
    if (head === '\x89PNG' && view.getUint32(4) === 0x0d0a1a0a) return 'png';
    // GIF87a or GIF89a
    if (head === 'GIF8' && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61)
        return 'gif';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
    if (head === 'RIFF' && bytes.length >= 12 && fourCC(view, 8) === 'WEBP')
        return 'webp';
    if (head === 'II*\0' || head === 'MM\0*') return 'tiff';
    if (fourCC(view, 4) === 'ftyp') return 'heif';
    return null;
}

/** The four ASCII characters at `offset`. */
export function fourCC(view: DataView, offset: number): string {
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
    );
}

/** A four-character box type as the big-endian uint32 a box header stores. */
export function boxType(name: string): number {
    return (
        ((name.charCodeAt(0) << 24) |
            (name.charCodeAt(1) << 16) |
            (name.charCodeAt(2) << 8) |
            name.charCodeAt(3)) >>>
        0
    );
}

/** Whether the six bytes at `offset` are the EXIF identifier `Exif\0\0`. */
export function isExifIdentifier(view: DataView, offset: number): boolean {
    return (
        offset + 6 <= view.byteLength &&
        fourCC(view, offset) === 'Exif' &&
        view.getUint16(offset + 4) === 0
    );
}

/**
 * A PNG's chunks after the signature, up to `IEND`. A chunk's CRC follows its
 * payload; `end` may pass the end of a file that is cut short.
 */
export function* readPngChunks(view: DataView): Generator<Chunk> {
    let offset = 8;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset);
        const type = fourCC(view, offset + 4);
        const start = offset + 8;
        yield { type, start, end: start + length };
        if (type === 'IEND') return;
        offset = start + length + 4;
    }
}

/**
 * A JPEG's marker segments up to and including the start of scan, after which
 * the image data runs. `end` may pass the end of a file that is cut short.
 */
export function* readJpegSegments(view: DataView): Generator<Segment> {
    let offset = 2; // skip FF D8
    while (offset + 3 < view.byteLength) {
        if (view.getUint8(offset) !== 0xff) return;
        let marker = view.getUint8(offset + 1);
        offset += 2;
        // A marker may be preceded by any number of FF fill bytes.
        while (marker === 0xff) {
            if (offset >= view.byteLength) return;
            marker = view.getUint8(offset);
            offset += 1;
        }
        // The segment length counts its own two bytes.
        if (offset + 1 >= view.byteLength) return;
        const length = view.getUint16(offset);
        if (length < 2) return;
        yield { marker, start: offset + 2, end: offset + length };
        if (marker === 0xda) return;
        offset += length;
    }
}

/**
 * A WebP's chunks after the `RIFF....WEBP` header. Each payload is padded to an
 * even length; `end` may pass the end of a file that is cut short.
 */
export function* readWebpChunks(view: DataView): Generator<Chunk> {
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
        const size = view.getUint32(offset + 4, true);
        const start = offset + 8;
        yield { type: fourCC(view, offset), start, end: start + size };
        offset = start + size + (size % 2);
    }
}

/**
 * The TIFF structure whose header is at `start` and whose bytes end at `end`
 * (a TIFF file, or the EXIF block inside another format), or null when the
 * header is not a TIFF header.
 */
export function readTiffHeader(view: DataView, start: number, end: number): Tiff | null {
    const bound = Math.min(end, view.byteLength);
    if (start + 8 > bound) return null;
    const order = view.getUint16(start);
    if (order !== 0x4949 && order !== 0x4d4d) return null;
    const littleEndian = order === 0x4949;
    if (view.getUint16(start + 2, littleEndian) !== 42) return null;
    return { start, end: bound, littleEndian };
}

/** The offset of a TIFF structure's first IFD, from the TIFF header. */
export function firstIfdOffset(view: DataView, tiff: Tiff): number {
    return view.getUint32(tiff.start + 4, tiff.littleEndian);
}

/**
 * The entries of the IFD at `ifdOffset` (counted from the TIFF header), stopping
 * at the structure's end.
 */
export function readIfdEntries(
    view: DataView,
    tiff: Tiff,
    ifdOffset: number
): IfdEntry[] {
    const ifd = tiff.start + ifdOffset;
    if (ifd + 2 > tiff.end) return [];
    const count = view.getUint16(ifd, tiff.littleEndian);
    const entries: IfdEntry[] = [];
    for (let i = 0; i < count; i++) {
        const offset = ifd + 2 + i * 12;
        if (offset + 12 > tiff.end) break;
        entries.push({
            offset,
            tag: view.getUint16(offset, tiff.littleEndian),
            type: view.getUint16(offset + 2, tiff.littleEndian),
            count: view.getUint32(offset + 4, tiff.littleEndian),
        });
    }
    return entries;
}

/** The value of a single SHORT or LONG entry, which sits in the entry itself. */
export function readIfdNumber(
    view: DataView,
    tiff: Tiff,
    entry: IfdEntry
): number | undefined {
    if (entry.count !== 1) return undefined;
    if (entry.type === 3) return view.getUint16(entry.offset + 8, tiff.littleEndian);
    if (entry.type === 4) return view.getUint32(entry.offset + 8, tiff.littleEndian);
    return undefined;
}

/**
 * The boxes laid end to end between `start` and `end`, at most `limit` of them.
 * A size of 0 runs the box to `end`; a size of 1 means a 64-bit size follows the type.
 */
export function* readBoxes(
    view: DataView,
    start: number,
    end: number,
    limit = MAX_BOXES
): Generator<Box> {
    let offset = start;
    for (let read = 0; read < limit && offset + 8 <= end; read++) {
        let size = view.getUint32(offset);
        let header = 8;
        if (size === 1) {
            if (offset + 16 > end) return;
            size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
            header = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < header || offset + size > end) return;
        yield {
            type: view.getUint32(offset + 4),
            start: offset + header,
            end: offset + size,
        };
        offset += size;
    }
}

/** The first box of `type` between `start` and `end`, among the first boxes there. */
export function findBox(
    view: DataView,
    start: number,
    end: number,
    type: number
): Box | undefined {
    for (const box of readBoxes(view, start, end)) {
        if (box.type === type) return box;
    }
    return undefined;
}
