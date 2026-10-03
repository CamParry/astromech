/**
 * GPS removal for uploaded images. Blanks the location in an image's EXIF and
 * XMP in place, with no re-encode, so the pixels and the file's length do not
 * change and it needs no image driver.
 */

import type { Box, Tiff } from './header';
import {
    boxType,
    detectImageFormat,
    findBox,
    firstIfdOffset,
    isExifIdentifier,
    readBoxes,
    readIfdEntries,
    readIfdValueRange,
    readJpegSegments,
    readPngChunks,
    readTiffHeader,
    readWebpChunks,
} from './header';

/** The IFD0 tag pointing at the GPS IFD, and the TIFF tag holding an XMP packet. */
const TAG_GPS_IFD = 0x8825;
const TAG_XMP = 0x02bc;

/** HEIF box and item types this module uses. */
const META = boxType('meta');
const IINF = boxType('iinf');
const INFE = boxType('infe');
const ILOC = boxType('iloc');
const IDAT = boxType('idat');
const EXIF_ITEM = boxType('Exif');
const MIME_ITEM = boxType('mime');

/** The identifiers that open an XMP APP1 segment in a JPEG. */
const JPEG_XMP_IDENTIFIERS = [
    'http://ns.adobe.com/xap/1.0/\0',
    'http://ns.adobe.com/xmp/extension/\0',
];
/** The PNG text keyword for an XMP packet. */
const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp';
/** The prefix of every XMP GPS property name. */
const GPS_PROPERTY = asciiBytes('exif:GPS');
/** The most bytes a compressed XMP packet is inflated to before it is left alone. */
const MAX_XMP_BYTES = 16 * 1024 * 1024;
/** The most data bytes one stored deflate block holds. */
const MAX_STORED_BLOCK = 0xffff;

const SPACE = 0x20;
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const EQUALS = 0x3d;

const CRC_TABLE = buildCrcTable();

/**
 * Remove the GPS location from an image's metadata, in place: EXIF's GPS IFD is
 * zeroed and IFD0's pointer to it deleted, as exiftool deletes both, and XMP's
 * `exif:GPS*` values become spaces. Other metadata is kept.
 */
export async function removeGpsMetadata(bytes: Uint8Array): Promise<void> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // An untrusted upload: a read the checks miss stops the walk, keeping what it blanked.
    try {
        switch (detectImageFormat(bytes)) {
            case 'jpeg':
                removeFromJpeg(view, bytes);
                return;
            case 'png':
                await removeFromPng(view, bytes);
                return;
            case 'webp':
                removeFromWebp(view, bytes);
                return;
            case 'tiff':
                removeFromTiff(view, bytes);
                return;
            case 'heif':
                removeFromHeif(view, bytes);
                return;
            case 'gif':
            case null:
                return;
        }
    } catch {
        return;
    }
}

function removeFromJpeg(view: DataView, bytes: Uint8Array): void {
    for (const { marker, start, end } of readJpegSegments(view)) {
        if (marker !== 0xe1 || end > bytes.length) continue;
        if (isExifIdentifier(view, start)) {
            removeFromExif(view, bytes, start, end);
        } else if (JPEG_XMP_IDENTIFIERS.some((id) => startsWith(bytes, start, id))) {
            blankXmpGps(bytes, start, end);
        }
    }
}

/** EXIF lives in `eXIf` and XMP in an `iTXt` or `zTXt` chunk, each followed by a CRC. */
async function removeFromPng(view: DataView, bytes: Uint8Array): Promise<void> {
    for (const chunk of readPngChunks(view)) {
        if (chunk.end + 4 > bytes.length) return;
        let changed = false;
        if (chunk.type === 'eXIf') {
            changed = removeFromExif(view, bytes, chunk.start, chunk.end);
        } else if (chunk.type === 'iTXt' || chunk.type === 'zTXt') {
            changed = await removeFromPngText(bytes, chunk.type, chunk.start, chunk.end);
        }
        // The CRC covers the chunk type and data.
        if (changed) view.setUint32(chunk.end, crc32(bytes, chunk.start - 4, chunk.end));
    }
}

/** Blank the GPS values in a PNG text chunk when it holds an XMP packet. */
async function removeFromPngText(
    bytes: Uint8Array,
    type: string,
    start: number,
    end: number
): Promise<boolean> {
    const keywordEnd = indexOfByte(bytes, 0, start, end);
    if (keywordEnd === -1 || latin1(bytes, start, keywordEnd) !== PNG_XMP_KEYWORD) {
        return false;
    }
    // zTXt: compression method, then the compressed text.
    if (type === 'zTXt') return blankCompressedXmpGps(bytes, keywordEnd + 2, end);
    // iTXt: compression flag and method, then a language tag and a translated keyword, each ending in 0.
    const compressed = bytes[keywordEnd + 1] === 1;
    const languageEnd = indexOfByte(bytes, 0, keywordEnd + 3, end);
    const translatedEnd =
        languageEnd === -1 ? -1 : indexOfByte(bytes, 0, languageEnd + 1, end);
    if (translatedEnd === -1) return false;
    return compressed
        ? blankCompressedXmpGps(bytes, translatedEnd + 1, end)
        : blankXmpGps(bytes, translatedEnd + 1, end);
}

function removeFromWebp(view: DataView, bytes: Uint8Array): void {
    for (const chunk of readWebpChunks(view)) {
        if (chunk.end > bytes.length) return;
        if (chunk.type === 'EXIF') removeFromExif(view, bytes, chunk.start, chunk.end);
        if (chunk.type === 'XMP ') blankXmpGps(bytes, chunk.start, chunk.end);
    }
}

function removeFromTiff(view: DataView, bytes: Uint8Array): void {
    const tiff = readTiffHeader(view, 0, bytes.length);
    if (!tiff) return;
    removeGpsIfd(view, bytes, tiff);
    const xmp = readIfdEntries(view, tiff, firstIfdOffset(view, tiff)).find(
        (entry) => entry.tag === TAG_XMP
    );
    const range = xmp && readIfdValueRange(view, tiff, xmp);
    if (range) blankXmpGps(bytes, range.start, range.end);
}

/**
 * A HEIF file keeps EXIF in an `Exif` item and XMP in a `mime` item, each
 * stored where the `iloc` box says. Only an item stored in one piece is read.
 */
function removeFromHeif(view: DataView, bytes: Uint8Array): void {
    const meta = findBox(view, 0, bytes.length, META);
    // meta, iinf, infe and iloc are full boxes: a version byte and 3 flag bytes first.
    if (!meta || meta.start + 4 > meta.end) return;
    const iinf = findBox(view, meta.start + 4, meta.end, IINF);
    const iloc = findBox(view, meta.start + 4, meta.end, ILOC);
    if (!iinf || !iloc) return;
    const items = readMetadataItems(view, bytes, iinf);
    if (items.size === 0) return;
    const idat = findBox(view, meta.start + 4, meta.end, IDAT);

    for (const [id, { start, end }] of readItemLocations(view, iloc, idat, items)) {
        if (start < 0 || end > bytes.length) continue;
        if (items.get(id) === 'xmp') {
            blankXmpGps(bytes, start, end);
        } else if (start + 4 <= end) {
            // An Exif item opens with the offset from after itself to the TIFF header.
            removeFromExif(view, bytes, start + 4 + view.getUint32(start), end);
        }
    }
}

/** The ids of a HEIF file's EXIF items and uncompressed XMP items. */
function readMetadataItems(
    view: DataView,
    bytes: Uint8Array,
    iinf: Box
): Map<number, 'exif' | 'xmp'> {
    const items = new Map<number, 'exif' | 'xmp'>();
    const countSize = view.getUint8(iinf.start) === 0 ? 2 : 4;
    const entries = iinf.start + 4 + countSize;
    if (entries > iinf.end) return items;
    const count =
        countSize === 2 ? view.getUint16(iinf.start + 4) : view.getUint32(iinf.start + 4);

    for (const infe of readBoxes(view, entries, iinf.end, count)) {
        // Versions 2 and 3 hold the item id (2 or 4 bytes), a protection index, then the type.
        const version = infe.start < infe.end ? view.getUint8(infe.start) : 0;
        if (infe.type !== INFE || version < 2) continue;
        const idSize = version === 2 ? 2 : 4;
        const typeAt = infe.start + 4 + idSize + 2;
        if (typeAt + 4 > infe.end) continue;
        const id =
            idSize === 2
                ? view.getUint16(infe.start + 4)
                : view.getUint32(infe.start + 4);
        const type = view.getUint32(typeAt);
        if (type === EXIF_ITEM) items.set(id, 'exif');
        if (type === MIME_ITEM && isPlainXmpItem(bytes, typeAt + 4, infe.end)) {
            items.set(id, 'xmp');
        }
    }
    return items;
}

/** Whether a `mime` item's name, content type and encoding say it is uncompressed XMP. */
function isPlainXmpItem(bytes: Uint8Array, start: number, end: number): boolean {
    const nameEnd = indexOfByte(bytes, 0, start, end);
    if (nameEnd === -1) return false;
    const typeEnd = indexOfByte(bytes, 0, nameEnd + 1, end);
    if (typeEnd === -1 || latin1(bytes, nameEnd + 1, typeEnd) !== 'application/rdf+xml') {
        return false;
    }
    // The content encoding is optional; an empty one means none.
    return typeEnd + 1 >= end || bytes[typeEnd + 1] === 0;
}

/**
 * Where each of `items` is stored, from the `iloc` box: a file offset, or an
 * offset into the `idat` box. An item in more than one extent is left out.
 */
function readItemLocations(
    view: DataView,
    iloc: Box,
    idat: Box | undefined,
    items: Map<number, unknown>
): Map<number, { start: number; end: number }> {
    const locations = new Map<number, { start: number; end: number }>();
    if (iloc.start + 8 > iloc.end) return locations;
    const version = view.getUint8(iloc.start);
    const offsetSize = view.getUint8(iloc.start + 4) >> 4;
    const lengthSize = view.getUint8(iloc.start + 4) & 0x0f;
    const baseOffsetSize = view.getUint8(iloc.start + 5) >> 4;
    const indexSize =
        version === 1 || version === 2 ? view.getUint8(iloc.start + 5) & 0x0f : 0;
    const wideIds = version === 2;
    let at = iloc.start + 6;
    const itemCount = wideIds ? view.getUint32(at) : view.getUint16(at);
    at += wideIds ? 4 : 2;

    for (let item = 0; item < itemCount && at < iloc.end; item++) {
        const id = wideIds ? view.getUint32(at) : view.getUint16(at);
        at += wideIds ? 4 : 2;
        // Versions 1 and 2 add a construction method: 0 is a file offset, 1 an idat offset.
        const method = version === 1 || version === 2 ? view.getUint16(at) & 0x0f : 0;
        if (version === 1 || version === 2) at += 2;
        at += 2; // data reference index
        const baseOffset = readSizedNumber(view, at, baseOffsetSize);
        at += baseOffsetSize;
        const extentCount = view.getUint16(at);
        at += 2;
        let offset = 0;
        let length = 0;
        for (let extent = 0; extent < extentCount && at <= iloc.end; extent++) {
            at += indexSize;
            offset = readSizedNumber(view, at, offsetSize);
            at += offsetSize;
            length = readSizedNumber(view, at, lengthSize);
            at += lengthSize;
        }
        if (at > iloc.end) break;
        if (!items.has(id) || extentCount !== 1) continue;
        if (method === 0) {
            const start = baseOffset + offset;
            locations.set(id, {
                start,
                end: length === 0 ? view.byteLength : start + length,
            });
        } else if (method === 1 && idat) {
            const start = idat.start + baseOffset + offset;
            locations.set(id, { start, end: length === 0 ? idat.end : start + length });
        }
    }
    return locations;
}

/** An unsigned big-endian number `size` bytes long (0, 4 or 8) at `offset`. */
function readSizedNumber(view: DataView, offset: number, size: number): number {
    if (size === 4) return view.getUint32(offset);
    if (size === 8) return view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4);
    return 0;
}

/**
 * Remove the GPS IFD from the EXIF block between `start` and `end`, which may
 * open with `Exif\0\0`. Returns whether anything changed.
 */
function removeFromExif(
    view: DataView,
    bytes: Uint8Array,
    start: number,
    end: number
): boolean {
    const tiff = readTiffHeader(
        view,
        isExifIdentifier(view, start) ? start + 6 : start,
        end
    );
    return tiff ? removeGpsIfd(view, bytes, tiff) : false;
}

/** Zero every GPS IFD in a TIFF structure and remove IFD0's pointers to them. */
function removeGpsIfd(view: DataView, bytes: Uint8Array, tiff: Tiff): boolean {
    const ifd0 = firstIfdOffset(view, tiff);
    let changed = false;
    // Each pass removes one pointer, so the loop ends.
    for (;;) {
        const pointer = readIfdEntries(view, tiff, ifd0).find(
            (entry) => entry.tag === TAG_GPS_IFD
        );
        if (!pointer) return changed;
        const gpsIfd = view.getUint32(pointer.offset + 8, tiff.littleEndian);
        // An offset inside the 8-byte header is malformed; zeroing there would erase the header.
        if (gpsIfd >= 8) zeroIfd(view, bytes, tiff, gpsIfd);
        deleteIfdEntry(view, bytes, tiff, ifd0, pointer.offset);
        changed = true;
    }
}

/** Zero an IFD's entries, its next-IFD offset, and the values its entries point at. */
function zeroIfd(view: DataView, bytes: Uint8Array, tiff: Tiff, offset: number): void {
    const entries = readIfdEntries(view, tiff, offset);
    for (const entry of entries) {
        const range = readIfdValueRange(view, tiff, entry);
        if (range && range.end - range.start > 4) bytes.fill(0, range.start, range.end);
    }
    const ifd = tiff.start + offset;
    bytes.fill(0, ifd, Math.min(ifd + 2 + entries.length * 12 + 4, tiff.end));
}

/**
 * Delete the entry at `entryOffset` from the IFD at `ifdOffset`: the entries
 * after it and the next-IFD offset move up 12 bytes, and the 12 bytes freed at
 * the end become zeros. An IFD cut short has the entry zeroed instead.
 */
function deleteIfdEntry(
    view: DataView,
    bytes: Uint8Array,
    tiff: Tiff,
    ifdOffset: number,
    entryOffset: number
): void {
    const ifd = tiff.start + ifdOffset;
    const count = view.getUint16(ifd, tiff.littleEndian);
    const end = ifd + 2 + count * 12 + 4;
    if (entryOffset >= ifd + 2 + count * 12 || end > tiff.end) {
        bytes.fill(0, entryOffset, entryOffset + 12);
        return;
    }
    bytes.copyWithin(entryOffset, entryOffset + 12, end);
    bytes.fill(0, end - 12, end);
    view.setUint16(ifd, count - 1, tiff.littleEndian);
}

/**
 * Overwrite with spaces the values of the `exif:GPS*` properties in the XMP
 * between `start` and `end`: an attribute's quoted value, or an element's
 * content. Returns whether anything changed.
 */
function blankXmpGps(bytes: Uint8Array, start: number, end: number): boolean {
    let changed = false;
    let at = indexOfBytes(bytes, GPS_PROPERTY, start, end);
    while (at !== -1) {
        let nameEnd = at + GPS_PROPERTY.length;
        while (nameEnd < end && isNameByte(bytes[nameEnd] ?? 0)) nameEnd++;
        const before = bytes[at - 1];
        const value =
            before === LESS_THAN
                ? elementContent(bytes, at, nameEnd, end)
                : before === SLASH
                  ? null
                  : attributeValue(bytes, nameEnd, end);
        if (value) {
            for (let i = value.start; i < value.end; i++) {
                if (bytes[i] !== SPACE) changed = true;
                bytes[i] = SPACE;
            }
        }
        at = indexOfBytes(bytes, GPS_PROPERTY, value ? value.end : nameEnd, end);
    }
    return changed;
}

/** The content of the element whose name runs from `nameStart` to `nameEnd`, up to its end tag. */
function elementContent(
    bytes: Uint8Array,
    nameStart: number,
    nameEnd: number,
    end: number
): { start: number; end: number } | null {
    const tagEnd = indexOfByte(bytes, GREATER_THAN, nameEnd, end);
    if (tagEnd === -1) return null;
    // A self-closing element carries its value in attributes, which are blanked whole.
    if (bytes[tagEnd - 1] === SLASH) return { start: nameEnd, end: tagEnd - 1 };
    const endTag = new Uint8Array([
        LESS_THAN,
        SLASH,
        ...bytes.subarray(nameStart, nameEnd),
    ]);
    const close = indexOfBytes(bytes, endTag, tagEnd + 1, end);
    return close === -1 ? null : { start: tagEnd + 1, end: close };
}

/** The quoted value of the attribute whose name ends at `nameEnd`. */
function attributeValue(
    bytes: Uint8Array,
    nameEnd: number,
    end: number
): { start: number; end: number } | null {
    let at = skipSpace(bytes, nameEnd, end);
    if (bytes[at] !== EQUALS) return null;
    at = skipSpace(bytes, at + 1, end);
    const quote = bytes[at];
    if (quote !== 0x22 && quote !== 0x27) return null;
    const close = indexOfByte(bytes, quote, at + 1, end);
    return close === -1 ? null : { start: at + 1, end: close };
}

/**
 * Blank the GPS values in a zlib-compressed XMP packet between `start` and
 * `end`, compressing it again into exactly the same bytes. The stream is
 * filled out with leading spaces; when the packet no longer fits it becomes all spaces.
 */
async function blankCompressedXmpGps(
    bytes: Uint8Array,
    start: number,
    end: number
): Promise<boolean> {
    const text = await inflate(bytes.subarray(start, end));
    if (!text || !blankXmpGps(text, 0, text.length)) return false;
    const stream =
        (await zlibStreamOfLength(text, end - start)) ??
        (await zlibStreamOfLength(new Uint8Array(), end - start));
    if (!stream) return false;
    bytes.set(stream, start);
    return true;
}

/** Inflate a zlib stream, or null when it is malformed or larger than an XMP packet can be. */
async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
    try {
        const reader = new Blob([data.slice()])
            .stream()
            .pipeThrough(new DecompressionStream('deflate'))
            .getReader();
        const parts: Uint8Array[] = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > MAX_XMP_BYTES) {
                await reader.cancel();
                return null;
            }
            parts.push(value);
        }
        return concat(parts, size);
    } catch {
        return null;
    }
}

/**
 * A zlib stream exactly `length` bytes long that inflates to spaces followed by
 * `text`: stored blocks of spaces, then `text` compressed. Null when `text`
 * compressed leaves no room for the stored blocks.
 */
async function zlibStreamOfLength(
    text: Uint8Array,
    length: number
): Promise<Uint8Array | null> {
    const compressed = await new Response(
        new Blob([text.slice()]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer();
    // Drop the 2-byte zlib header and 4-byte checksum to leave the raw deflate data.
    const deflated = new Uint8Array(compressed).subarray(2, compressed.byteLength - 4);
    // A stored block costs 5 bytes before its data: a block header byte, its length and that length's complement.
    const room = length - 6 - deflated.length;
    const blocks = Math.ceil(room / (MAX_STORED_BLOCK + 5));
    const spaces = room - blocks * 5;
    if (room < 0 || spaces < 0) return null;

    const stream = new Uint8Array(length);
    const view = new DataView(stream.buffer);
    stream.set([0x78, 0x01]);
    let at = 2;
    let left = spaces;
    for (let block = 0; block < blocks; block++) {
        const size = Math.min(left, MAX_STORED_BLOCK);
        view.setUint16(at + 1, size, true);
        view.setUint16(at + 3, ~size & 0xffff, true);
        stream.fill(SPACE, at + 5, at + 5 + size);
        at += 5 + size;
        left -= size;
    }
    stream.set(deflated, at);
    view.setUint32(length - 4, adler32(spaces, text));
    return stream;
}

/** The Adler-32 checksum of `spaces` spaces followed by `text`. */
function adler32(spaces: number, text: Uint8Array): number {
    let a = 1;
    let b = 0;
    for (let i = 0; i < spaces; i++) {
        a = (a + SPACE) % 65521;
        b = (b + a) % 65521;
    }
    for (const byte of text) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

/** The CRC-32 of the bytes from `start` to `end`, as a PNG chunk stores it. */
function crc32(bytes: Uint8Array, start: number, end: number): number {
    let crc = 0xffffffff;
    for (let i = start; i < end; i++) {
        crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
}

function concat(parts: Uint8Array[], size: number): Uint8Array {
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

function asciiBytes(text: string): Uint8Array {
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
    return String.fromCharCode(...bytes.subarray(start, end));
}

function startsWith(bytes: Uint8Array, at: number, prefix: string): boolean {
    return latin1(bytes, at, at + prefix.length) === prefix;
}

function isNameByte(byte: number): boolean {
    return (
        (byte >= 0x30 && byte <= 0x39) ||
        (byte >= 0x41 && byte <= 0x5a) ||
        (byte >= 0x61 && byte <= 0x7a) ||
        byte === 0x5f ||
        byte === 0x2d ||
        byte === 0x2e
    );
}

function skipSpace(bytes: Uint8Array, at: number, end: number): number {
    let i = at;
    while (
        i < end &&
        (bytes[i] === SPACE ||
            bytes[i] === 0x09 ||
            bytes[i] === 0x0a ||
            bytes[i] === 0x0d)
    )
        i++;
    return i;
}

/** The index of `value` between `start` and `end`, or -1. */
function indexOfByte(
    bytes: Uint8Array,
    value: number,
    start: number,
    end: number
): number {
    const index = bytes.subarray(start, end).indexOf(value);
    return index === -1 ? -1 : start + index;
}

/** The index of `pattern` between `start` and `end`, or -1. */
function indexOfBytes(
    bytes: Uint8Array,
    pattern: Uint8Array,
    start: number,
    end: number
): number {
    const first = pattern[0] ?? 0;
    for (let at = indexOfByte(bytes, first, start, end); at !== -1; ) {
        if (at + pattern.length > end) return -1;
        let match = true;
        for (let i = 1; i < pattern.length && match; i++)
            match = bytes[at + i] === pattern[i];
        if (match) return at;
        at = indexOfByte(bytes, first, at + 1, end);
    }
    return -1;
}
