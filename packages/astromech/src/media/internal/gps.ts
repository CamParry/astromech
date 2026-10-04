/**
 * GPS removal for uploaded images. Blanks the location in an image's EXIF, XMP
 * and PNG text in place, with no re-encode, so the pixels and the file's length
 * do not change and it needs no image driver.
 */

import type { Box, Chunk, Tiff } from '../serving/image/header';
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
} from '../serving/image/header';

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
/** The XMP namespace of the EXIF properties, whose `GPS*` properties hold the location. */
const EXIF_NAMESPACE = 'http://ns.adobe.com/exif/1.0/';
/** DJI's drone namespace, and its properties that hold the location. */
const DJI_NAMESPACE = 'http://www.dji.com/drone-dji/1.0/';
const DJI_LOCATION_PROPERTIES = [
    'GpsLatitude',
    'GpsLongitude',
    'GpsLongtitude',
    'AbsoluteAltitude',
];
/** The longest PNG text keyword, and the longest namespace URI compared with the ones above. */
const MAX_KEYWORD_LENGTH = 79;
const MAX_NAMESPACE_URI_LENGTH = 256;
/** How many bytes are turned into a string at a time, to stay within the engine's argument limit. */
const DECODE_SLICE = 8192;
/** The most bytes the compressed text chunks of one PNG inflate to, together. */
const MAX_INFLATED_BYTES = 16 * 1024 * 1024;
/** The most spaces added to the end of a text to make it compress to the length it had. */
const MAX_TRAILING_SPACES = 8;
/** The most data bytes one stored deflate block holds. */
const MAX_STORED_BLOCK = 0xffff;

const XMLNS = asciiBytes('xmlns');
const GPS = asciiBytes('GPS');
const DJI_LOCATION_NAMES = DJI_LOCATION_PROPERTIES.map(asciiBytes);
const HEX_DIGITS = asciiBytes('0123456789abcdef');

const NEWLINE = 0x0a;
const SPACE = 0x20;
const COLON = 0x3a;
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const EQUALS = 0x3d;

const CRC_TABLE = buildCrcTable();

/** Where a run of bytes starts and ends. */
type Range = { start: number; end: number };

/** How many more bytes the compressed text in one file may inflate to. */
type Budget = { left: number };

/** The XMP prefixes bound to the EXIF and DJI namespaces; '' stands for a default namespace. */
type XmpPrefixes = { exif: Set<string>; dji: Set<string> };

/** An XML name: where it starts and ends, and where the colon after its prefix is (-1 when it has none). */
type QualifiedName = { start: number; colon: number; end: number };

/** Finds where an element's start tag ends and where an end tag of `name` starts, at or after `from`, or -1. */
type TagFinder = {
    tagEnd: (from: number) => number;
    endTag: (name: string, from: number) => number;
};

/**
 * An edited text laid out to be compressed again: `head` stays first,
 * uncompressed, then spaces fill the room left over, then `body`. An `exact`
 * split takes no spaces before its body, so it fits only with no room left over.
 */
type Split = { head: Uint8Array; body: Uint8Array; exact?: boolean };

/**
 * How to remove the GPS data from one kind of text: `blank` edits it in place,
 * and `splits` lists the ways to lay out the edited text to compress it again, best first.
 */
type TextEdit = {
    blank: (bytes: Uint8Array, start: number, end: number) => boolean;
    splits: (text: Uint8Array) => Split[];
};

/**
 * Remove the GPS location from an image's metadata, in place: EXIF's GPS IFD is
 * zeroed and IFD0's pointer to it deleted, as exiftool deletes both, and the
 * XMP and PNG text values that hold a location become spaces. Other metadata is kept.
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
    const xmp: Range[] = [];
    for (const { marker, start, end } of readJpegSegments(view)) {
        if (marker !== 0xe1 || end > bytes.length) continue;
        if (isExifIdentifier(view, start)) {
            removeFromExif(view, bytes, start, end);
        } else if (JPEG_XMP_IDENTIFIERS.some((id) => startsWith(bytes, start, id))) {
            xmp.push({ start, end });
        }
    }
    // An extended XMP segment may rely on the namespaces the main packet declares.
    const prefixes = readLocationPrefixes(bytes, xmp);
    for (const { start, end } of xmp) blankXmpGps(bytes, start, end, prefixes);
}

/**
 * EXIF lives in `eXIf`, XMP in an `iTXt` or `zTXt` chunk, and ImageMagick's
 * copies of both in text chunks. Each chunk is followed by a CRC.
 */
async function removeFromPng(view: DataView, bytes: Uint8Array): Promise<void> {
    const budget = { left: MAX_INFLATED_BYTES };
    for (const chunk of readPngChunks(view)) {
        if (chunk.end + 4 > bytes.length) return;
        let changed = false;
        if (chunk.type === 'eXIf') {
            changed = removeFromExif(view, bytes, chunk.start, chunk.end);
        } else if (
            chunk.type === 'tEXt' ||
            chunk.type === 'iTXt' ||
            chunk.type === 'zTXt'
        ) {
            changed = await removeFromPngText(bytes, chunk, budget);
        }
        // The CRC covers the chunk type and data.
        if (changed) view.setUint32(chunk.end, crc32(bytes, chunk.start - 4, chunk.end));
    }
}

/** Blank the GPS data in a PNG text chunk whose keyword names a text that holds some. */
async function removeFromPngText(
    bytes: Uint8Array,
    { type, start, end }: Chunk,
    budget: Budget
): Promise<boolean> {
    const keywordEnd = indexOfByte(
        bytes,
        0,
        start,
        Math.min(end, start + MAX_KEYWORD_LENGTH + 1)
    );
    const edit = keywordEnd === -1 ? null : pngTextEdit(latin1(bytes, start, keywordEnd));
    if (!edit) return false;
    if (type === 'tEXt') return edit.blank(bytes, keywordEnd + 1, end);
    // zTXt: compression method, then the compressed text.
    if (type === 'zTXt') {
        return blankCompressedText(bytes, keywordEnd + 2, end, edit, budget);
    }
    // iTXt: compression flag and method, then a language tag and a translated keyword, each ending in 0.
    const compressed = bytes[keywordEnd + 1] === 1;
    const languageEnd = indexOfByte(bytes, 0, keywordEnd + 3, end);
    const translatedEnd =
        languageEnd === -1 ? -1 : indexOfByte(bytes, 0, languageEnd + 1, end);
    if (translatedEnd === -1) return false;
    return compressed
        ? blankCompressedText(bytes, translatedEnd + 1, end, edit, budget)
        : edit.blank(bytes, translatedEnd + 1, end);
}

/**
 * How to remove the GPS data from the text a PNG text keyword names: an XMP
 * packet, one of ImageMagick's `exif:GPS*` values, or one of its raw profiles.
 */
function pngTextEdit(keyword: string): TextEdit | null {
    if (keyword === 'XML:com.adobe.xmp') return XMP_EDIT;
    if (keyword.startsWith('exif:GPS')) return VALUE_EDIT;
    if (keyword === 'Raw profile type exif' || keyword === 'Raw profile type APP1') {
        return RAW_EXIF_EDIT;
    }
    if (keyword === 'Raw profile type xmp') return RAW_XMP_EDIT;
    return null;
}

const XMP_EDIT: TextEdit = {
    blank: (bytes, start, end) => blankXmpGps(bytes, start, end),
    // An XML declaration only restates the defaults, so it is dropped when it does not fit first.
    splits: (text) => {
        const declaration = xmlDeclarationLength(text);
        const body = text.subarray(declaration);
        return declaration === 0
            ? [{ head: new Uint8Array(), body }]
            : [
                  { head: text.subarray(0, declaration), body },
                  { head: new Uint8Array(), body },
              ];
    },
};

const VALUE_EDIT: TextEdit = {
    blank: (bytes, start, end) => {
        const changed = bytes.subarray(start, end).some((byte) => byte !== SPACE);
        bytes.fill(SPACE, start, end);
        return changed;
    },
    splits: (text) => [{ head: new Uint8Array(), body: text }],
};

const RAW_EXIF_EDIT: TextEdit = {
    blank: (bytes, start, end) =>
        editRawProfile(bytes, start, end, (profile) =>
            removeFromExif(new DataView(profile.buffer), profile, 0, profile.length)
        ),
    splits: rawProfileSplits,
};

const RAW_XMP_EDIT: TextEdit = {
    blank: (bytes, start, end) =>
        editRawProfile(bytes, start, end, (profile) =>
            blankXmpGps(profile, 0, profile.length)
        ),
    splits: rawProfileSplits,
};

/**
 * A raw profile opens with its header, so spaces never go before it: the header
 * stays first uncompressed, or the whole text compresses again with no room left over.
 */
function rawProfileSplits(text: Uint8Array): Split[] {
    const hexStart = readRawProfileHeader(text)?.hexStart ?? 0;
    return [
        { head: text.subarray(0, hexStart), body: text.subarray(hexStart) },
        { head: new Uint8Array(), body: text, exact: true },
    ];
}

/** The length of the XML declaration a text opens with, or 0 when it has none. */
function xmlDeclarationLength(text: Uint8Array): number {
    if (!startsWith(text, 0, '<?xml')) return 0;
    const close = indexOfBytes(text, asciiBytes('?>'), 0, Math.min(text.length, 256));
    return close === -1 ? 0 : close + 2;
}

/**
 * Edit the profile in an ImageMagick raw profile text, which is a newline, the
 * profile's name, a newline, its length padded with spaces, a newline, then its
 * bytes in hex. The hex is rewritten in place when `edit` changes the bytes.
 */
function editRawProfile(
    bytes: Uint8Array,
    start: number,
    end: number,
    edit: (profile: Uint8Array) => boolean
): boolean {
    const text = bytes.subarray(start, end);
    const header = readRawProfileHeader(text);
    if (!header || header.length * 2 > text.length - header.hexStart) return false;
    const { hexStart, length } = header;
    const profile = new Uint8Array(length);
    let digits = 0;
    for (let i = hexStart; i < text.length && digits < length * 2; i++) {
        const nibble = hexValue(text[i] ?? 0);
        if (nibble === -1) continue;
        profile[digits >> 1] = ((profile[digits >> 1] ?? 0) << 4) | nibble;
        digits++;
    }
    if (digits < length * 2 || !edit(profile)) return false;
    digits = 0;
    for (let i = hexStart; i < text.length && digits < length * 2; i++) {
        if (hexValue(text[i] ?? 0) === -1) continue;
        const byte = profile[digits >> 1] ?? 0;
        text[i] = HEX_DIGITS[digits % 2 === 0 ? byte >> 4 : byte & 0x0f] ?? 0;
        digits++;
    }
    return true;
}

/**
 * A raw profile's length in bytes, and where its hex starts: after the newline
 * that ends the length. Null when the header is malformed.
 */
function readRawProfileHeader(
    text: Uint8Array
): { length: number; hexStart: number } | null {
    const nameEnd = indexOfByte(text, NEWLINE, 1, Math.min(text.length, 256));
    if (text[0] !== NEWLINE || nameEnd === -1) return null;
    let at = skipSpace(text, nameEnd + 1, text.length);
    let length = 0;
    const digitsStart = at;
    for (; at < text.length && isDigit(text[at] ?? 0) && at - digitsStart < 10; at++) {
        length = length * 10 + (text[at] ?? 0) - 0x30;
    }
    if (at === digitsStart || length === 0 || text[at] !== NEWLINE) return null;
    return { length, hexStart: at + 1 };
}

/** The value of a hex digit, or -1 for any other byte. */
function hexValue(byte: number): number {
    if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
    if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
    if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
    return -1;
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
 * offset into the `idat` box. An item in more than one extent, or in another
 * file, is left out.
 */
function readItemLocations(
    view: DataView,
    iloc: Box,
    idat: Box | undefined,
    items: Map<number, unknown>
): Map<number, Range> {
    const locations = new Map<number, Range>();
    const version = iloc.start < iloc.end ? view.getUint8(iloc.start) : 0;
    if (iloc.start + 8 > iloc.end || version > 2) return locations;
    const offsetSize = view.getUint8(iloc.start + 4) >> 4;
    const lengthSize = view.getUint8(iloc.start + 4) & 0x0f;
    const baseOffsetSize = view.getUint8(iloc.start + 5) >> 4;
    // Versions 1 and 2 add an extent index and a construction method; version 2 widens the ids.
    const indexSize = version === 0 ? 0 : view.getUint8(iloc.start + 5) & 0x0f;
    const idSize = version === 2 ? 4 : 2;
    const itemSize = idSize + (version === 0 ? 0 : 2) + 2 + baseOffsetSize + 2;
    const extentSize = indexSize + offsetSize + lengthSize;
    let at = iloc.start + 6;
    const itemCount = idSize === 4 ? view.getUint32(at) : view.getUint16(at);
    at += idSize;
    const count = Math.min(itemCount, Math.floor((iloc.end - at) / itemSize));

    for (let item = 0; item < count && at + itemSize <= iloc.end; item++) {
        const id = idSize === 4 ? view.getUint32(at) : view.getUint16(at);
        at += idSize;
        // The construction method: 0 is a file offset, 1 an idat offset.
        const method = version === 0 ? 0 : view.getUint16(at) & 0x0f;
        if (version !== 0) at += 2;
        // A data reference index other than 0 points into another file.
        const dataReferenceIndex = view.getUint16(at);
        at += 2;
        const baseOffset = readSizedNumber(view, at, baseOffsetSize);
        at += baseOffsetSize;
        const extentCount = view.getUint16(at);
        const extent = at + 2;
        at = extent + extentCount * extentSize;
        if (at > iloc.end) break;
        if (!items.has(id) || extentCount !== 1 || dataReferenceIndex !== 0) continue;
        const offset = readSizedNumber(view, extent + indexSize, offsetSize);
        const length = readSizedNumber(view, extent + indexSize + offsetSize, lengthSize);
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
    const pointers = readIfdEntries(view, tiff, ifd0).filter(
        (entry) => entry.tag === TAG_GPS_IFD
    );
    if (pointers.length === 0) return false;
    const gpsIfds = new Set(
        pointers.map((entry) => view.getUint32(entry.offset + 8, tiff.littleEndian))
    );
    const values: Range[] = [];
    // In order, so an IFD inside one already zeroed reads as empty: overlapping IFDs cost no more than one.
    for (const gpsIfd of [...gpsIfds].sort((a, b) => a - b)) {
        // An offset inside the 8-byte header is malformed; zeroing there would erase the header.
        if (gpsIfd >= 8) zeroIfd(view, bytes, tiff, gpsIfd, values);
    }
    // Entries may share their values, so each byte is zeroed once.
    for (const { start, end } of mergeRanges(values)) bytes.fill(0, start, end);
    deleteIfdEntries(view, bytes, tiff, ifd0, TAG_GPS_IFD);
    return true;
}

/**
 * Zero an IFD's entries and its next-IFD offset, adding to `values` where the
 * values its entries point at lie.
 */
function zeroIfd(
    view: DataView,
    bytes: Uint8Array,
    tiff: Tiff,
    offset: number,
    values: Range[]
): void {
    const entries = readIfdEntries(view, tiff, offset);
    for (const entry of entries) {
        const range = readIfdValueRange(view, tiff, entry);
        if (range && range.end - range.start > 4) values.push(range);
    }
    const ifd = tiff.start + offset;
    bytes.fill(0, ifd, Math.min(ifd + 2 + entries.length * 12 + 4, tiff.end));
}

/** `ranges` sorted, with the ones that overlap or touch joined. */
function mergeRanges(ranges: Range[]): Range[] {
    const merged: Range[] = [];
    for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
        const last = merged.at(-1);
        if (last && range.start <= last.end) {
            last.end = Math.max(last.end, range.end);
        } else {
            merged.push({ ...range });
        }
    }
    return merged;
}

/**
 * Delete the entries tagged `tag` from the IFD at `ifdOffset`: the entries after
 * them and the next-IFD offset move up, and the bytes freed at the end become
 * zeros. An IFD cut short has those entries zeroed instead.
 */
function deleteIfdEntries(
    view: DataView,
    bytes: Uint8Array,
    tiff: Tiff,
    ifdOffset: number,
    tag: number
): void {
    const ifd = tiff.start + ifdOffset;
    const entries = readIfdEntries(view, tiff, ifdOffset);
    const end = ifd + 2 + view.getUint16(ifd, tiff.littleEndian) * 12 + 4;
    if (end > tiff.end) {
        for (const entry of entries) {
            if (entry.tag === tag) bytes.fill(0, entry.offset, entry.offset + 12);
        }
        return;
    }
    let kept = ifd + 2;
    for (const entry of entries) {
        if (entry.tag === tag) continue;
        bytes.copyWithin(kept, entry.offset, entry.offset + 12);
        kept += 12;
    }
    bytes.copyWithin(kept, end - 4, end);
    bytes.fill(0, kept + 4, end);
    view.setUint16(ifd, (kept - ifd - 2) / 12, tiff.littleEndian);
}

/**
 * Overwrite with spaces the values of the location properties in the XMP
 * between `start` and `end`: an attribute's quoted value, or an element's
 * content. Reads each name once. Returns whether anything changed.
 */
function blankXmpGps(
    bytes: Uint8Array,
    start: number,
    end: number,
    prefixes = readLocationPrefixes(bytes, [{ start, end }])
): boolean {
    const tags = createTagFinder(bytes, start, end, prefixes);
    let changed = false;
    for (let at = start; at < end; ) {
        if (!isNameByte(bytes[at] ?? 0)) {
            at++;
            continue;
        }
        const name = readQualifiedName(bytes, at, end);
        const before = at > start ? (bytes[at - 1] ?? 0) : 0;
        // A name in a default namespace is an element's; attributes have no default namespace.
        const value = !isLocationName(bytes, name, prefixes)
            ? null
            : before === LESS_THAN
              ? elementContent(bytes, name, tags)
              : before === SLASH || before === COLON || name.colon === -1
                ? null
                : attributeValue(bytes, name.end, end);
        if (value) {
            for (let i = value.start; i < value.end; i++) {
                if (bytes[i] !== SPACE) changed = true;
                bytes[i] = SPACE;
            }
        }
        at = value ? value.end : name.end;
    }
    return changed;
}

/**
 * The prefixes bound to the EXIF and DJI namespaces in the XMP packets in
 * `ranges`, the usual prefixes included.
 */
function readLocationPrefixes(bytes: Uint8Array, ranges: Range[]): XmpPrefixes {
    const exif = new Set(['exif']);
    const dji = new Set(['drone-dji']);
    for (const { start, end } of ranges) {
        for (const [prefix, uri] of readNamespaces(bytes, start, end)) {
            if (uri === EXIF_NAMESPACE) exif.add(prefix);
            if (uri === DJI_NAMESPACE) dji.add(prefix);
        }
    }
    return { exif, dji };
}

/**
 * Each `xmlns` declaration between `start` and `end`, as its prefix (empty for
 * a default namespace) and URI. A URI too long to be one of ours is skipped.
 */
function* readNamespaces(
    bytes: Uint8Array,
    start: number,
    end: number
): Generator<[string, string]> {
    let at = indexOfBytes(bytes, XMLNS, start, end);
    while (at !== -1) {
        let nameEnd = at + XMLNS.length;
        if (bytes[nameEnd] === COLON) {
            nameEnd++;
            while (nameEnd < end && isNameByte(bytes[nameEnd] ?? 0)) nameEnd++;
        }
        const prefix =
            nameEnd > at + XMLNS.length
                ? latin1(bytes, at + XMLNS.length + 1, nameEnd)
                : '';
        const value = isNameByte(bytes[at - 1] ?? 0)
            ? null
            : attributeValue(bytes, nameEnd, end);
        if (value && value.end - value.start <= MAX_NAMESPACE_URI_LENGTH) {
            yield [prefix, latin1(bytes, value.start, value.end)];
        }
        at = indexOfBytes(bytes, XMLNS, value ? value.end : nameEnd, end);
    }
}

/** The XML name starting at `at`: name bytes, then a colon and more name bytes when it has a prefix. */
function readQualifiedName(bytes: Uint8Array, at: number, end: number): QualifiedName {
    let nameEnd = at;
    while (nameEnd < end && isNameByte(bytes[nameEnd] ?? 0)) nameEnd++;
    let colon = -1;
    if (
        bytes[nameEnd] === COLON &&
        nameEnd + 1 < end &&
        isNameByte(bytes[nameEnd + 1] ?? 0)
    ) {
        colon = nameEnd;
        nameEnd++;
        while (nameEnd < end && isNameByte(bytes[nameEnd] ?? 0)) nameEnd++;
    }
    return { start: at, colon, end: nameEnd };
}

/**
 * Whether `name` is a whole name that holds a location: `GPS*` under a prefix
 * bound to the EXIF namespace, or one of DJI's properties under a prefix bound to DJI's.
 */
function isLocationName(
    bytes: Uint8Array,
    { start, colon, end }: QualifiedName,
    prefixes: XmpPrefixes
): boolean {
    // Followed by a colon, it is part of a longer name.
    if (bytes[end] === COLON || isNameByte(bytes[end] ?? 0)) return false;
    const localStart = colon === -1 ? start : colon + 1;
    const isGps = startsWithBytes(bytes, localStart, end, GPS);
    const isDji = DJI_LOCATION_NAMES.some(
        (property) =>
            end - localStart === property.length &&
            startsWithBytes(bytes, localStart, end, property)
    );
    if (!isGps && !isDji) return false;
    const prefix = colon === -1 ? '' : latin1(bytes, start, colon);
    return (isGps && prefixes.exif.has(prefix)) || (isDji && prefixes.dji.has(prefix));
}

/**
 * A tag finder for the XMP between `start` and `end`. Its searches move forward
 * through the packet, so together they read it about once.
 */
function createTagFinder(
    bytes: Uint8Array,
    start: number,
    end: number,
    prefixes: XmpPrefixes
): TagFinder {
    // The first `>` at or after `searchedFrom`, or -1 when there is none.
    let searchedFrom = end;
    let found = -1;
    let endTags: Map<string, number[]> | null = null;
    return {
        tagEnd: (from) => {
            if (from < searchedFrom || (found !== -1 && found < from)) {
                searchedFrom = from;
                found = indexOfByte(bytes, GREATER_THAN, from, end);
            }
            return found;
        },
        endTag: (name, from) => {
            endTags ??= indexEndTags(bytes, start, end, prefixes);
            const positions = endTags.get(name) ?? [];
            // The first position at or after `from`, by binary search.
            let low = 0;
            let high = positions.length;
            while (low < high) {
                const middle = (low + high) >> 1;
                if ((positions[middle] ?? 0) < from) low = middle + 1;
                else high = middle;
            }
            return positions[low] ?? -1;
        },
    };
}

/** Where each end tag of a location property starts, in order, by the property's name. */
function indexEndTags(
    bytes: Uint8Array,
    start: number,
    end: number,
    prefixes: XmpPrefixes
): Map<string, number[]> {
    const endTags = new Map<string, number[]>();
    for (let at = indexOfByte(bytes, LESS_THAN, start, end); at !== -1; ) {
        let next = at + 1;
        if (bytes[at + 1] === SLASH && at + 2 < end && isNameByte(bytes[at + 2] ?? 0)) {
            const name = readQualifiedName(bytes, at + 2, end);
            if (isLocationName(bytes, name, prefixes)) {
                const key = latin1(bytes, name.start, name.end);
                const positions = endTags.get(key) ?? [];
                positions.push(at);
                endTags.set(key, positions);
            }
            next = name.end;
        }
        at = indexOfByte(bytes, LESS_THAN, next, end);
    }
    return endTags;
}

/** The content of the element `name` opens, up to its end tag. */
function elementContent(
    bytes: Uint8Array,
    name: QualifiedName,
    tags: TagFinder
): Range | null {
    const tagEnd = tags.tagEnd(name.end);
    if (tagEnd === -1) return null;
    // A self-closing element carries its value in attributes, which are blanked whole.
    if (bytes[tagEnd - 1] === SLASH) return { start: name.end, end: tagEnd - 1 };
    const close = tags.endTag(latin1(bytes, name.start, name.end), tagEnd + 1);
    return close === -1 ? null : { start: tagEnd + 1, end: close };
}

/** The quoted value of the attribute whose name ends at `nameEnd`. */
function attributeValue(bytes: Uint8Array, nameEnd: number, end: number): Range | null {
    let at = skipSpace(bytes, nameEnd, end);
    if (bytes[at] !== EQUALS) return null;
    at = skipSpace(bytes, at + 1, end);
    const quote = bytes[at];
    if (quote !== 0x22 && quote !== 0x27) return null;
    const close = indexOfByte(bytes, quote, at + 1, end);
    return close === -1 ? null : { start: at + 1, end: close };
}

/**
 * Blank the GPS data in a zlib-compressed text between `start` and `end`,
 * compressing it again into exactly the same number of bytes, laid out by the
 * first of the edit's splits that fits. When none fits it becomes all spaces.
 */
async function blankCompressedText(
    bytes: Uint8Array,
    start: number,
    end: number,
    edit: TextEdit,
    budget: Budget
): Promise<boolean> {
    const text = await inflate(bytes.subarray(start, end), budget);
    if (!text || !edit.blank(text, 0, text.length)) return false;
    const empty = new Uint8Array();
    for (const split of [...edit.splits(text), { head: empty, body: empty }]) {
        const stream = await zlibStreamOfLength(split, end - start);
        if (stream) {
            bytes.set(stream, start);
            return true;
        }
    }
    return false;
}

/**
 * Inflate a zlib stream, or null when it is malformed or would take the file's
 * inflated bytes past their budget.
 */
async function inflate(data: Uint8Array, budget: Budget): Promise<Uint8Array | null> {
    if (budget.left === 0) return null;
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
            if (size > budget.left) {
                budget.left = 0;
                await reader.cancel();
                return null;
            }
            parts.push(value);
        }
        budget.left -= size;
        return concat(parts, size);
    } catch {
        return null;
    }
}

/**
 * A zlib stream exactly `length` bytes long that inflates to the split's head,
 * spaces, then its body, or null. A few bytes off, it tries again with spaces
 * added to the end of the body, which change its compressed length.
 */
async function zlibStreamOfLength(
    { head, body, exact = false }: Split,
    length: number
): Promise<Uint8Array | null> {
    for (let padding = 0; padding <= MAX_TRAILING_SPACES; padding++) {
        const padded = new Uint8Array(body.length + padding).fill(SPACE);
        padded.set(body);
        const compressed = new Uint8Array(
            await new Response(
                new Blob([padded]).stream().pipeThrough(new CompressionStream('deflate'))
            ).arrayBuffer()
        );
        // Drop the 2-byte zlib header and 4-byte checksum to leave the raw deflate data.
        const deflated = compressed.subarray(2, compressed.length - 4);
        const room = length - 6 - deflated.length;
        const stream =
            exact && room !== 0 ? null : buildZlibStream(head, room, padded, deflated);
        if (stream) return stream;
        // How far it is from fitting: past the length, or short of a stored block's 5 bytes.
        const gap =
            head.length === 0 && (room < 0 || exact)
                ? Math.abs(room)
                : head.length + 5 - room;
        if (gap > 4) return null;
    }
    return null;
}

/**
 * A zlib stream of `head` and then spaces in stored blocks taking `room` bytes,
 * then `deflated`, which is `body` compressed. Null when `head` does not fit.
 */
function buildZlibStream(
    head: Uint8Array,
    room: number,
    body: Uint8Array,
    deflated: Uint8Array
): Uint8Array | null {
    // A stored block costs 5 bytes before its data: a block header byte, its length and that length's complement.
    const blocks = Math.ceil(room / (MAX_STORED_BLOCK + 5));
    const stored = room - blocks * 5;
    if (room < 0 || stored < head.length) return null;

    const stream = new Uint8Array(2 + room + deflated.length + 4);
    const view = new DataView(stream.buffer);
    stream.set([0x78, 0x01]);
    const data = new Uint8Array(stored).fill(SPACE);
    data.set(head);
    let at = 2;
    for (let block = 0, taken = 0; block < blocks; block++) {
        const size = Math.min(stored - taken, MAX_STORED_BLOCK);
        view.setUint16(at + 1, size, true);
        view.setUint16(at + 3, ~size & 0xffff, true);
        stream.set(data.subarray(taken, taken + size), at + 5);
        at += 5 + size;
        taken += size;
    }
    stream.set(deflated, at);
    view.setUint32(at + deflated.length, adler32([data, body]));
    return stream;
}

/** The Adler-32 checksum of `parts` laid end to end. */
function adler32(parts: Uint8Array[]): number {
    let a = 1;
    let b = 0;
    for (const part of parts) {
        // Reduced every 5552 bytes, as zlib does, rather than on every byte.
        for (let i = 0; i < part.length; ) {
            const runEnd = Math.min(i + 5552, part.length);
            for (; i < runEnd; i++) {
                a += part[i] ?? 0;
                b += a;
            }
            a %= 65521;
            b %= 65521;
        }
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

/** The bytes from `start` to `end` as a Latin-1 string. */
function latin1(bytes: Uint8Array, start: number, end: number): string {
    let text = '';
    for (let at = start; at < end; at += DECODE_SLICE) {
        text += String.fromCharCode(
            ...bytes.subarray(at, Math.min(at + DECODE_SLICE, end))
        );
    }
    return text;
}

/** Whether the bytes from `start` to `end` start with `prefix`. */
function startsWithBytes(
    bytes: Uint8Array,
    start: number,
    end: number,
    prefix: Uint8Array
): boolean {
    if (end - start < prefix.length) return false;
    return prefix.every((byte, i) => bytes[start + i] === byte);
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

function isDigit(byte: number): boolean {
    return byte >= 0x30 && byte <= 0x39;
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
