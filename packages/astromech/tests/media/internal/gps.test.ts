import type { StorageDriver } from '@/types/index';
import { createHash } from 'node:crypto';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import {
    createTestDb,
    createTestStorage,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import sharpLib from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { removeGpsMetadata } from '@/media/internal/gps';
import { handleMediaRequest } from '@/media/serving/handler';

const mediaService = currentServices.media;

/** IFD0 tags the tests look for. */
const TAG_MODEL = 0x0110;
const TAG_COPYRIGHT = 0x8298;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_TITLE = 0x9c9b;
const TAG_PRINT_IM = 0xc4a5;

const exif = {
    IFD0: { Copyright: 'Example Copyright Holder', Model: 'Example Phone 9' },
    IFD2: { DateTimeOriginal: '2026:10:03 12:00:00' },
    IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 1234/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 0/1',
    },
};
/** GPSLatitude's three rationals, as the numerators and denominators the file stores. */
const LATITUDE = [51, 1, 30, 1, 1234, 100];

const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" exif:GPSLatitude="51,30.2N">' +
    '<exif:GPSLongitude>0,7.0W</exif:GPSLongitude>' +
    '<dc:rights>Example Rights</dc:rights>' +
    '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

type Format = 'jpeg' | 'png' | 'webp' | 'avif';

let storage: StorageDriver;

beforeEach(async () => {
    await createTestDb();
    storage = createTestStorage();
    setupTestConfig({ ...makeTestConfig(), storage });
});

/** A 40x20 photo in `format` with a gradient, carrying the EXIF and XMP above. */
async function photoWithGps(format: Format | 'tiff'): Promise<Uint8Array> {
    const gradient = new Uint8Array(40 * 20 * 3).map((_, index) => index % 251);
    const bytes = await sharpLib(gradient, {
        raw: { width: 40, height: 20, channels: 3 },
    })
        .toFormat(format)
        .withExif(exif)
        .withXmp(xmp)
        .toBuffer();
    return new Uint8Array(bytes);
}

/** Upload `bytes` as a file of `format`. */
async function upload(bytes: Uint8Array, format: string): Promise<string> {
    const file = new File([bytes as BlobPart], `photo.${format}`, {
        type: `image/${format}`,
    });
    return (await mediaService.upload({ file })).id;
}

/** The bytes the media route serves for item `id`'s original. */
async function served(id: string): Promise<Uint8Array> {
    const res = await handleMediaRequest({
        id,
        ext: '',
        search: new URLSearchParams(),
        origin: 'http://x',
    });
    if (res.status !== 200)
        throw new Error(`expected a 200 for ${id}, got ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

/** The tags in IFD0 of an EXIF block as sharp returns it: `Exif\0\0`, then a TIFF structure. */
function ifd0Tags(block: Uint8Array | undefined): number[] {
    if (!block) throw new Error('expected an EXIF block');
    const start = String.fromCharCode(...block.subarray(0, 4)) === 'Exif' ? 6 : 0;
    const view = new DataView(block.buffer, block.byteOffset + start);
    const littleEndian = view.getUint16(0) === 0x4949;
    const ifd = view.getUint32(4, littleEndian);
    const count = view.getUint16(ifd, littleEndian);
    return Array.from({ length: count }, (_, i) =>
        view.getUint16(ifd + 2 + i * 12, littleEndian)
    );
}

/** Whether `bytes` hold GPSLatitude's rationals, in either byte order. */
function holdsLatitude(bytes: Uint8Array): boolean {
    const encode = (littleEndian: boolean): Buffer => {
        const out = Buffer.alloc(LATITUDE.length * 4);
        LATITUDE.forEach((value, i) =>
            littleEndian
                ? out.writeUInt32LE(value, i * 4)
                : out.writeUInt32BE(value, i * 4)
        );
        return out;
    };
    const haystack = Buffer.from(bytes);
    return haystack.includes(encode(true)) || haystack.includes(encode(false));
}

/** Whether every chunk of a PNG carries the CRC of its type and data. */
function hasValidCrcs(png: Uint8Array): boolean {
    const bytes = Buffer.from(png);
    for (let offset = 8; offset + 12 <= bytes.length; ) {
        const length = bytes.readUInt32BE(offset);
        const crc = bytes.readUInt32BE(offset + 8 + length);
        if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== crc) return false;
        offset += 12 + length;
    }
    return true;
}

/** Decoded pixels, to compare two files' image data. */
async function pixels(bytes: Uint8Array): Promise<Buffer> {
    return sharpLib(bytes).raw().toBuffer();
}

describe('GPS removal on upload', () => {
    it.each<Format>(['jpeg', 'png', 'webp', 'avif'])(
        'serves a %s original without its GPS data, keeping its other metadata, pixels and size',
        async (format) => {
            const original = await photoWithGps(format);
            const before = await sharpLib(original).metadata();
            expect(ifd0Tags(before.exif)).toContain(TAG_GPS_IFD);
            expect(holdsLatitude(original)).toBe(true);
            expect(before.xmp?.toString()).toContain('51,30.2N');

            const stored = await served(await upload(original, format));

            const after = await sharpLib(stored).metadata();
            expect(ifd0Tags(after.exif)).not.toContain(TAG_GPS_IFD);
            expect(holdsLatitude(stored)).toBe(false);
            expect(ifd0Tags(after.exif)).toEqual(
                expect.arrayContaining([TAG_MODEL, TAG_COPYRIGHT, TAG_EXIF_IFD])
            );
            const exifText = Buffer.from(after.exif ?? []).toString('latin1');
            expect(exifText).toContain('Example Phone 9');
            expect(exifText).toContain('Example Copyright Holder');
            expect(exifText).toContain('2026:10:03 12:00:00');
            const xmpText = after.xmp?.toString() ?? '';
            expect(xmpText).not.toContain('51,30.2N');
            expect(xmpText).not.toContain('0,7.0W');
            expect(xmpText).toContain('<dc:rights>Example Rights</dc:rights>');
            expect(stored.length).toBe(original.length);
            expect(await pixels(stored)).toEqual(await pixels(original));
            if (format === 'png') expect(hasValidCrcs(stored)).toBe(true);
        }
    );

    it('blanks the GPS values in a TIFF’s XMP', async () => {
        const original = await photoWithGps('tiff');
        expect((await sharpLib(original).metadata()).xmp?.toString()).toContain(
            '51,30.2N'
        );

        const stored = await served(await upload(original, 'tiff'));

        const xmpText = (await sharpLib(stored).metadata()).xmp?.toString() ?? '';
        expect(xmpText).not.toContain('51,30.2N');
        expect(xmpText).not.toContain('0,7.0W');
        expect(xmpText).toContain('<dc:rights>Example Rights</dc:rights>');
        expect(stored.length).toBe(original.length);
    });

    it('blanks the GPS values in a PNG’s uncompressed iTXt XMP and keeps its CRC valid', async () => {
        const plain = new Uint8Array(
            await sharpLib({
                create: { width: 40, height: 20, channels: 3, background: '#808080' },
            })
                .png()
                .toBuffer()
        );
        // keyword, compression flag and method, empty language tag and translated keyword, text
        const original = withPngChunks(plain, [
            pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0', Buffer.from(xmp, 'utf8')),
        ]);
        expect((await sharpLib(original).metadata()).xmp?.toString()).toContain(
            '51,30.2N'
        );

        const stored = await served(await upload(original, 'png'));

        const xmpText = (await sharpLib(stored).metadata()).xmp?.toString() ?? '';
        expect(xmpText).not.toContain('51,30.2N');
        expect(xmpText).not.toContain('0,7.0W');
        expect(xmpText).toContain('<dc:rights>Example Rights</dc:rights>');
        expect(stored.length).toBe(original.length);
        expect(hasValidCrcs(stored)).toBe(true);
    });

    it('records the size and content hash of the stored bytes', async () => {
        const original = await photoWithGps('jpeg');

        const media = await mediaService.get({ id: await upload(original, 'jpeg') });
        const stored = await served(media?.id ?? '');

        const hash = createHash('sha256').update(stored).digest('hex').slice(0, 12);
        expect(media?.metadata?.version).toBe(hash);
        expect(media?.size).toBe(stored.length);
    });

    it.each([
        ['no metadata', {}],
        ['EXIF without GPS', { IFD0: { Copyright: 'Example Copyright Holder' } }],
    ])('stores a JPEG with %s byte for byte', async (_, metadata) => {
        const original = new Uint8Array(
            await sharpLib({
                create: { width: 40, height: 20, channels: 3, background: '#808080' },
            })
                .jpeg()
                .withExif(metadata)
                .toBuffer()
        );

        const stored = await served(await upload(original, 'jpeg'));

        expect(stored).toEqual(original);
    });

    it.each(['application/octet-stream', ''])(
        'removes the GPS data from a JPEG declared as %j, and records the declared type',
        async (type) => {
            const original = await photoWithGps('jpeg');
            const file = new File([original as BlobPart], 'photo', { type });

            const media = await mediaService.upload({ file });
            const stored = await served(media.id);

            expect(holdsLatitude(stored)).toBe(false);
            expect(ifd0Tags((await sharpLib(stored).metadata()).exif)).not.toContain(
                TAG_GPS_IFD
            );
            expect(stored.length).toBe(original.length);
            expect(media.mimeType).toBe(type);
        }
    );

    it('streams an MP4 to storage without reading it whole', async () => {
        // An MP4 opens with an ftyp box, as a HEIF image does, but lists video brands.
        const mp4 = concat(
            box('ftyp', latin1('isom'), u32(512), latin1('isomiso2avc1mp41')),
            box('mdat', new Uint8Array(64))
        );
        class StreamOnlyFile extends File {
            override arrayBuffer(): Promise<ArrayBuffer> {
                throw new Error('read whole');
            }
        }
        const file = new StreamOnlyFile([mp4 as BlobPart], 'clip.mp4', {
            type: 'video/mp4',
        });

        const media = await mediaService.upload({ file });

        expect(await served(media.id)).toEqual(mp4);
    });

    it('removes the GPS data from a replacement file', async () => {
        const id = await upload(await photoWithGps('png'), 'png');

        await mediaService.replace({
            id,
            file: new File([(await photoWithGps('jpeg')) as BlobPart], 'photo.jpeg', {
                type: 'image/jpeg',
            }),
        });

        expect(holdsLatitude(await served(id))).toBe(false);
    });
});

describe('removeGpsMetadata', () => {
    it.each([false, true])(
        'removes a GPS IFD whose pointer has tags after it, keeping those tags and the thumbnail (little-endian: %s)',
        async (littleEndian) => {
            const exifBlock = concat(latin1('Exif\0\0'), exifTiff(littleEndian));
            const base = await plainJpeg();
            // The APP1 segment goes straight after the 2-byte start-of-image marker.
            const bytes = concat(
                base.subarray(0, 2),
                jpegSegment(0xe1, exifBlock),
                base.subarray(2)
            );
            expect(holdsLatitude(bytes)).toBe(true);

            await removeGpsMetadata(bytes);

            expect(holdsLatitude(bytes)).toBe(false);
            // After the start-of-image marker and the segment's marker and length.
            const exif = readExif(bytes.subarray(6));
            expect(exif.tags).toEqual([
                TAG_MODEL,
                TAG_COPYRIGHT,
                TAG_EXIF_IFD,
                TAG_TITLE,
                TAG_PRINT_IM,
            ]);
            expect(exif.title).toEqual(latin1('T\0i\0t\0l\0e\0\0\0'));
            expect(exif.thumbnail).toEqual(THUMBNAIL);
            expect(await pixels(bytes)).toEqual(await pixels(base));
        }
    );

    it('removes the GPS IFD from a TIFF file', async () => {
        const bytes = exifTiff(false);

        await removeGpsMetadata(bytes);

        expect(holdsLatitude(bytes)).toBe(false);
        expect(readExif(bytes).tags).not.toContain(TAG_GPS_IFD);
        expect(readExif(bytes).thumbnail).toEqual(THUMBNAIL);
    });

    it('removes 65535 GPS pointers from IFD0 quickly', async () => {
        const count = 65535;
        const gpsIfd = 8 + 2 + count * 12 + 4;
        const bytes = new Uint8Array(gpsIfd + 2 + 12 + 4 + 24);
        const view = new DataView(bytes.buffer);
        bytes.set(latin1('MM\0*'));
        view.setUint32(4, 8);
        view.setUint16(8, count);
        for (let i = 0; i < count; i++) {
            view.setUint16(10 + i * 12, TAG_GPS_IFD);
            view.setUint16(10 + i * 12 + 2, 4);
            view.setUint32(10 + i * 12 + 4, 1);
            view.setUint32(10 + i * 12 + 8, gpsIfd);
        }
        // The GPS IFD: one GPSLatitude entry, whose three rationals follow it.
        view.setUint16(gpsIfd, 1);
        view.setUint16(gpsIfd + 2, 0x0002);
        view.setUint16(gpsIfd + 4, 5);
        view.setUint32(gpsIfd + 6, 3);
        view.setUint32(gpsIfd + 10, gpsIfd + 18);
        LATITUDE.forEach((value, i) => view.setUint32(gpsIfd + 18 + i * 4, value));
        expect(holdsLatitude(bytes)).toBe(true);

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(holdsLatitude(bytes)).toBe(false);
        expect(ifd0Tags(bytes)).toEqual([]);
    });

    it('zeroes a value block that every entry of five GPS IFDs shares, quickly', async () => {
        // Five GPS IFDs of 65535 entries each, every entry's value the same 4 MB block.
        const size = 8 * 1024 * 1024;
        const valueSize = 4 * 1024 * 1024;
        const gpsIfdCount = 5;
        const bytes = new Uint8Array(size);
        const view = new DataView(bytes.buffer);
        bytes.set(latin1('II*\0'));
        view.setUint32(4, 8, true);
        view.setUint16(8, gpsIfdCount, true);
        let gpsIfd = 8 + 2 + gpsIfdCount * 12 + 4;
        for (let k = 0; k < gpsIfdCount; k++) {
            const pointer = 10 + k * 12;
            view.setUint16(pointer, TAG_GPS_IFD, true);
            view.setUint16(pointer + 2, 4, true);
            view.setUint32(pointer + 4, 1, true);
            view.setUint32(pointer + 8, gpsIfd, true);
            view.setUint16(gpsIfd, 65535, true);
            for (let i = 0; i < 65535; i++) {
                const entry = gpsIfd + 2 + i * 12;
                view.setUint16(entry, 0x0002, true);
                view.setUint16(entry + 2, 1, true);
                view.setUint32(entry + 4, valueSize, true);
                view.setUint32(entry + 8, size - valueSize, true);
            }
            gpsIfd += 2 + 65535 * 12 + 4;
        }
        bytes.fill(0x41, size - valueSize);

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(bytes.subarray(size - valueSize).some((byte) => byte !== 0)).toBe(false);
        expect(ifd0Tags(bytes)).toEqual([]);
    });

    it.each([1, 2])(
        'removes the GPS IFD from a HEIF EXIF item stored in an idat box (iloc version %i)',
        async (version) => {
            const bytes = heifWithExifItem({ version, method: 1, dataReferenceIndex: 0 });
            expect(holdsLatitude(bytes)).toBe(true);

            await removeGpsMetadata(bytes);

            expect(holdsLatitude(bytes)).toBe(false);
            expect(Buffer.from(bytes).includes('Example Phone 9')).toBe(true);
        }
    );

    it('leaves alone a HEIF EXIF item that the iloc box places in another file', async () => {
        const bytes = heifWithExifItem({ version: 0, method: 0, dataReferenceIndex: 1 });
        const original = bytes.slice();

        await removeGpsMetadata(bytes);

        expect(bytes).toEqual(original);
    });

    it('finishes quickly on an iloc box of 65535 items of 65535 empty extents, leaving the file unchanged', async () => {
        // Offset, length, base offset and index sizes are all 0, so no extent takes any bytes.
        const item = new Uint8Array([0, 2, 0, 0, 0xff, 0xff]);
        const items = Array.from({ length: 65535 }, () => item);
        const bytes = concat(
            box('ftyp', latin1('heic'), u32(0), latin1('mif1heic')),
            fullBox(
                'meta',
                0,
                fullBox(
                    'iinf',
                    0,
                    u16(1),
                    fullBox('infe', 2, u16(1), u16(0), latin1('Exif'))
                ),
                fullBox('iloc', 0, new Uint8Array([0, 0]), u16(65535), ...items)
            )
        );
        const original = bytes.slice();

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(bytes).toEqual(original);
    });

    it('blanks the GPS values in an XMP packet that 1000 HEIF items share, quickly', async () => {
        // 200 KB of GPS elements with no end tag after the packet, read again by each item.
        const packet = latin1(xmp + '<exif:GPSA>'.repeat(18_000));
        const bytes = heifWithItems('mime', packet, sharedExtents(1000, packet));

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        const text = Buffer.from(bytes).toString('latin1');
        expect(text).not.toContain('51,30.2N');
        expect(text).not.toContain('0,7.0W');
        expect(text).toContain('<dc:rights>Example Rights</dc:rights>');
    }, 30_000);

    it('removes the GPS IFD from an EXIF block that 10000 HEIF items share, quickly', async () => {
        // IFD0 holds the GPS pointer and 65534 other entries, read again by each item.
        const count = 65535;
        const gpsIfd = 8 + 2 + count * 12 + 4;
        const tiff = new Uint8Array(gpsIfd + 2 + 12 + 4 + 24);
        const view = new DataView(tiff.buffer);
        tiff.set(latin1('MM\0*'));
        view.setUint32(4, 8);
        view.setUint16(8, count);
        view.setUint16(10, TAG_GPS_IFD);
        view.setUint16(12, 4);
        view.setUint32(14, 1);
        view.setUint32(18, gpsIfd);
        for (let i = 1; i < count; i++) {
            view.setUint16(10 + i * 12, TAG_MODEL);
            view.setUint16(10 + i * 12 + 2, 3);
            view.setUint32(10 + i * 12 + 4, 1);
        }
        // The GPS IFD: one GPSLatitude entry, whose three rationals follow it.
        view.setUint16(gpsIfd, 1);
        view.setUint16(gpsIfd + 2, 0x0002);
        view.setUint16(gpsIfd + 4, 5);
        view.setUint32(gpsIfd + 6, 3);
        view.setUint32(gpsIfd + 10, gpsIfd + 18);
        LATITUDE.forEach((value, i) => view.setUint32(gpsIfd + 18 + i * 4, value));
        // An Exif item opens with the offset from after itself to the TIFF header.
        const payload = concat(u32(6), latin1('Exif\0\0'), tiff);
        const bytes = heifWithItems('Exif', payload, sharedExtents(10_000, payload));
        expect(holdsLatitude(bytes)).toBe(true);

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(holdsLatitude(bytes)).toBe(false);
        const tags = ifd0Tags(bytes.subarray(bytes.length - payload.length + 4));
        expect(tags).toHaveLength(count - 1);
        expect(tags).not.toContain(TAG_GPS_IFD);
    }, 30_000);

    it('finishes quickly on 3000 HEIF EXIF items whose IFD0s overlap, two bytes apart', async () => {
        // Each item is its own TIFF header, pointing into one run of 0xff bytes,
        // which reads as an IFD0 of 65535 entries wherever it starts.
        const count = 3000;
        const headers = new Uint8Array(count * 12);
        const view = new DataView(headers.buffer);
        for (let i = 0; i < count; i++) {
            const at = i * 12;
            // A 0 offset to the TIFF header, then the header, its IFD0 2 * i bytes into the run.
            headers.set(latin1('MM\0*'), at + 4);
            view.setUint32(at + 8, headers.length + 2 * i - (at + 4));
        }
        const run = new Uint8Array(65535 * 12 + 2 * count + 16).fill(0xff);
        const payload = concat(headers, run);
        const extents = Array.from({ length: count }, (_, i) => ({
            offset: i * 12,
            length: payload.length - i * 12,
        }));
        const bytes = heifWithItems('Exif', payload, extents);
        const original = bytes.slice();

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(bytes).toEqual(original);
    }, 30_000);

    it('blanks the values of ImageMagick’s exif:GPS text chunks and keeps the others', async () => {
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('tEXt', 'exif:GPSLatitude\0', latin1('51/1,30/1,1234/100')),
            pngChunk('tEXt', 'exif:GPSLatitudeRef\0', latin1('N')),
            pngChunk('tEXt', 'exif:Model\0', latin1('Example Phone 9')),
        ]);

        await removeGpsMetadata(bytes);

        expect(readPngChunks(bytes).filter(({ type }) => type === 'tEXt')).toEqual([
            { type: 'tEXt', data: 'exif:GPSLatitude\0' + ' '.repeat(18) },
            { type: 'tEXt', data: 'exif:GPSLatitudeRef\0 ' },
            { type: 'tEXt', data: 'exif:Model\0Example Phone 9' },
        ]);
        expect(hasValidCrcs(bytes)).toBe(true);
    });

    it.each([
        ['Raw profile type exif', 'zTXt'],
        ['Raw profile type APP1', 'zTXt'],
        ['Raw profile type exif', 'tEXt'],
    ] as const)(
        'removes the GPS IFD from ImageMagick’s %s profile in a %s chunk',
        async (keyword, type) => {
            const profile = concat(latin1('Exif\0\0'), exifTiff(false));
            const text = rawProfile(
                keyword === 'Raw profile type exif' ? 'exif' : 'APP1',
                profile
            );
            const bytes = withPngChunks(await plainPng(), [
                type === 'zTXt'
                    ? pngChunk('zTXt', `${keyword}\0\0`, deflateSync(text))
                    : pngChunk('tEXt', `${keyword}\0`, text),
            ]);

            await removeGpsMetadata(bytes);

            const chunk = readPngChunks(bytes).find((c) => c.type === type);
            const data = Buffer.from(chunk?.data ?? '', 'latin1').subarray(
                keyword.length + (type === 'zTXt' ? 2 : 1)
            );
            const after =
                type === 'zTXt'
                    ? inflateSync(data).toString('latin1')
                    : data.toString('latin1');
            expect(after.split('\n').slice(0, 3)).toEqual(
                text.toString('latin1').split('\n').slice(0, 3)
            );
            const decoded = readRawProfile(after);
            expect(decoded.length).toBe(profile.length);
            expect(holdsLatitude(decoded)).toBe(false);
            expect(readExif(decoded).tags).toEqual([
                TAG_MODEL,
                TAG_COPYRIGHT,
                TAG_EXIF_IFD,
                TAG_TITLE,
                TAG_PRINT_IM,
            ]);
            expect(hasValidCrcs(bytes)).toBe(true);
        }
    );

    it('blanks GPS properties under any prefix bound to the EXIF namespace, and DJI’s coordinates and altitude', async () => {
        const packet =
            '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
            '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
            '<rdf:Description rdf:about="" xmlns:e="http://ns.adobe.com/exif/1.0/" ' +
            'xmlns:drone-dji="http://www.dji.com/drone-dji/1.0/" ' +
            'xmlns:dc="http://purl.org/dc/elements/1.1/" e:GPSLatitude="51,30.2N" ' +
            'drone-dji:GpsLatitude="+51.50341" drone-dji:GpsLongitude="-0.12762" ' +
            'drone-dji:GpsLongtitude="-0.12763" drone-dji:AbsoluteAltitude="+120.51" ' +
            'drone-dji:RelativeAltitude="+30.52">' +
            '<e:GPSLongitude>0,7.0W</e:GPSLongitude>' +
            '<GPSAltitude xmlns="http://ns.adobe.com/exif/1.0/">1234/10</GPSAltitude>' +
            '<dc:rights>Example Rights</dc:rights>' +
            '</rdf:Description></rdf:RDF></x:xmpmeta>';
        const bytes = new Uint8Array(
            await sharpLib(await plainJpeg())
                .withXmp(packet)
                .toBuffer()
        );

        await removeGpsMetadata(bytes);

        const text = Buffer.from(bytes).toString('latin1');
        for (const value of [
            '51,30.2N',
            '0,7.0W',
            '1234/10',
            '+51.50341',
            '-0.12762',
            '-0.12763',
            '+120.51',
        ]) {
            expect(text).not.toContain(value);
        }
        expect(text).toContain('drone-dji:RelativeAltitude="+30.52"');
        expect(text).toContain('<dc:rights>Example Rights</dc:rights>');
    });

    it('blanks the GPS values in an XMP packet that binds 4000 prefixes to the EXIF namespace, quickly', async () => {
        let packet = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description ';
        for (let i = 0; i < 4000; i++) {
            packet += `xmlns:p${i}="http://ns.adobe.com/exif/1.0/" `;
        }
        packet +=
            'p3999:GPSLatitude="51,30.2N">' +
            'p'.repeat(200_000) +
            '</rdf:Description></x:xmpmeta>';
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0', latin1(packet)),
        ]);

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(3000);
        expect(Buffer.from(bytes).includes('51,30.2N')).toBe(false);
        expect(Buffer.from(bytes).includes('p3999:GPSLatitude="        "')).toBe(true);
    });

    it.each([
        ['no end tag', (i: number) => `<exif:GPS${i}>v`],
        ['no closing bracket', (i: number) => `<exif:GPS${i} `],
    ])(
        'blanks the GPS values in an XMP packet after 200000 GPS elements with %s, quickly',
        async (_, element) => {
            const packet =
                Array.from({ length: 200_000 }, (_, i) => element(i)).join('') +
                '<exif:GPSLatitude>51,30.2N</exif:GPSLatitude>';
            const bytes = withPngChunks(await plainPng(), [
                pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0', latin1(packet)),
            ]);

            const started = performance.now();
            await removeGpsMetadata(bytes);

            expect(performance.now() - started).toBeLessThan(3000);
            expect(
                Buffer.from(bytes).includes(
                    '<exif:GPSLatitude>        </exif:GPSLatitude>'
                )
            ).toBe(true);
        }
    );

    it.each([
        [
            'a namespace URI of 1 MB',
            `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description xmlns:y="${'a'.repeat(1_000_000)}" ` +
                'xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="51,30.2N"/></x:xmpmeta>',
        ],
        [
            'a namespace prefix of 1 MB',
            `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description xmlns:${'q'.repeat(1_000_000)}=` +
                `"http://ns.adobe.com/exif/1.0/" ${'q'.repeat(1_000_000)}:GPSLatitude="51,30.2N"/></x:xmpmeta>`,
        ],
    ])('blanks the GPS values in an XMP packet with %s', async (_, packet) => {
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0', latin1(packet)),
        ]);

        await removeGpsMetadata(bytes);

        expect(Buffer.from(bytes).includes('51,30.2N')).toBe(false);
        expect(hasValidCrcs(bytes)).toBe(true);
    });

    it('blanks the GPS values in a PNG text chunk after one whose keyword is 1 MB long', async () => {
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('tEXt', `${'k'.repeat(1_000_000)}\0`, latin1('value')),
            pngChunk('tEXt', 'exif:GPSLatitude\0', latin1('51/1,30/1,1234/100')),
        ]);

        await removeGpsMetadata(bytes);

        expect(Buffer.from(bytes).includes('51/1,30/1,1234/100')).toBe(false);
        expect(hasValidCrcs(bytes)).toBe(true);
    });

    // At zlib's default level the blanked text fits only compressed whole; at level 1 its header fits uncompressed.
    it.each([
        ['tEXt', 0],
        ['zTXt', 6],
        ['zTXt', 1],
    ] as const)(
        'blanks the GPS values in ImageMagick’s raw XMP profile in a %s chunk (level %i), keeping the rest of the packet',
        async (type, level) => {
            const packet =
                '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
                '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
                '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
                '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
                'exif:GPSLatitude="51,30.2N"/></rdf:RDF></x:xmpmeta>';
            const text = rawProfile('xmp', latin1(packet));
            const keyword = 'Raw profile type xmp\0';
            const bytes = withPngChunks(await plainPng(), [
                type === 'zTXt'
                    ? pngChunk('zTXt', `${keyword}\0`, deflateSync(text, { level }))
                    : pngChunk('tEXt', keyword, text),
            ]);
            const length = bytes.length;

            await removeGpsMetadata(bytes);

            const chunk = readPngChunks(bytes).find((c) => c.type === type);
            const data = Buffer.from(chunk?.data ?? '', 'latin1').subarray(
                keyword.length + (type === 'zTXt' ? 1 : 0)
            );
            const after = (type === 'zTXt' ? inflateSync(data) : data).toString('latin1');
            // Read as exiftool reads a raw profile; ImageMagick's reader accepts more.
            const match = /^\n(.*?)\n\s*(\d+)\n(.*)/s.exec(after);
            expect(match?.[1]).toBe('xmp');
            expect(match?.[2]).toBe(String(packet.length));
            const hex = (match?.[3] ?? '').replace(/\s/g, '');
            expect(Buffer.from(hex, 'hex').toString('latin1')).toBe(
                packet.replace('51,30.2N', ' '.repeat(8))
            );
            expect(bytes.length).toBe(length);
            expect(hasValidCrcs(bytes)).toBe(true);
        }
    );

    it.each([
        ['zTXt', 'XML:com.adobe.xmp\0\0'],
        ['iTXt', 'XML:com.adobe.xmp\0\x01\0\0\0'],
    ] as const)(
        'blanks the GPS values in a PNG’s compressed %s XMP',
        async (type, prefix) => {
            const bytes = withPngChunks(await plainPng(), [
                pngChunk(type, prefix, deflateSync(Buffer.from(xmp, 'utf8'))),
            ]);
            const length = bytes.length;

            await removeGpsMetadata(bytes);

            const text = inflatedText(bytes, type, prefix.length);
            expect(text).not.toContain('51,30.2N');
            expect(text).not.toContain('0,7.0W');
            expect(text).toContain('<dc:rights>Example Rights</dc:rights>');
            expect(bytes.length).toBe(length);
            expect(hasValidCrcs(bytes)).toBe(true);
        }
    );

    it('keeps an XML declaration first in a compressed XMP packet', async () => {
        const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
        // Stored uncompressed, so the blanked packet has room to spare.
        const bytes = withPngChunks(await plainPng(), [
            pngChunk(
                'zTXt',
                'XML:com.adobe.xmp\0\0',
                deflateSync(declaration + xmp, { level: 0 })
            ),
        ]);

        await removeGpsMetadata(bytes);

        const text = inflatedText(bytes, 'zTXt', 19);
        expect(text.startsWith(declaration)).toBe(true);
        expect(text.slice(declaration.length).trimStart().startsWith('<?xpacket')).toBe(
            true
        );
        expect(text).not.toContain('51,30.2N');
        expect(text).toContain('<dc:rights>Example Rights</dc:rights>');
    });

    it('turns an XML declaration into spaces when the compressed packet has no room for it first', async () => {
        const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
        // Compressed as tightly as it is compressed again, which leaves a few bytes spare, not the declaration's 38.
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('zTXt', 'XML:com.adobe.xmp\0\0', deflateSync(declaration + xmp)),
        ]);

        await removeGpsMetadata(bytes);

        const text = inflatedText(bytes, 'zTXt', 19);
        expect(text).not.toContain('<?xml');
        expect(text.trimStart().startsWith('<?xpacket')).toBe(true);
        expect(text).not.toContain('51,30.2N');
        expect(text).toContain('<dc:rights>Example Rights</dc:rights>');
    });

    it('keeps the rest of a compressed XMP packet that compresses again to 1 to 4 bytes short', async () => {
        const { packet, blanked, stream } = await packetCompressingShort();
        const bytes = withPngChunks(await plainPng(), [
            pngChunk('zTXt', 'XML:com.adobe.xmp\0\0', stream),
        ]);

        await removeGpsMetadata(bytes);

        const after = inflatedText(bytes, 'zTXt', 19);
        expect(packet).toContain('<dc:rights>Example Rights</dc:rights>');
        expect(after.trimEnd()).toBe(blanked);
        expect(hasValidCrcs(bytes)).toBe(true);
    });

    // Builds and inflates three 2 MB texts: slow under coverage on a loaded runner.
    it('leaves alone the compressed text chunks past the first 2 MB a PNG inflates to', async () => {
        // Each chunk inflates to nearly 2 MB from about 2 KB.
        const text = Buffer.alloc(2 * 1024 * 1024 - 1024, 0x20);
        text.write(' exif:GPSLatitude="51,30.2N" ', 0, 'latin1');
        const chunk = pngChunk(
            'zTXt',
            'XML:com.adobe.xmp\0\0',
            deflateSync(text, { level: 9 })
        );
        const bytes = withPngChunks(
            await plainPng(),
            Array.from({ length: 100 }, () => chunk)
        );

        const started = performance.now();
        await removeGpsMetadata(bytes);

        expect(performance.now() - started).toBeLessThan(5000);
        const chunks = readPngChunks(bytes).filter(({ type }) => type === 'zTXt');
        const [first, second, last] = [chunks[0], chunks[1], chunks.at(-1)].map((chunk) =>
            inflateSync(Buffer.from(chunk?.data ?? '', 'latin1').subarray(19))
        );
        expect(first?.includes('51,30.2N')).toBe(false);
        expect(second?.includes('51,30.2N')).toBe(true);
        expect(last?.includes('51,30.2N')).toBe(true);
    }, 30_000);
});

/** The 16-byte stand-in for an EXIF thumbnail. */
const THUMBNAIL = latin1('thumbnail bytes!');

type TiffEntry = { tag: number; type: number; count: number; value: Uint8Array | number };

/**
 * An EXIF TIFF structure as a camera writes one: IFD0 with the GPS pointer
 * before two later tags, then the EXIF IFD, the GPS IFD and IFD1, which holds the thumbnail.
 */
function exifTiff(littleEndian: boolean): Uint8Array {
    const latitude = new Uint8Array(LATITUDE.length * 4);
    LATITUDE.forEach((value, i) =>
        new DataView(latitude.buffer).setUint32(i * 4, value, littleEndian)
    );
    const ifds = (exifIfd: number, gpsIfd: number, thumbnail: number): TiffEntry[][] => [
        [
            { tag: TAG_MODEL, type: 2, count: 16, value: latin1('Example Phone 9\0') },
            {
                tag: TAG_COPYRIGHT,
                type: 2,
                count: 25,
                value: latin1('Example Copyright Holder\0'),
            },
            { tag: TAG_EXIF_IFD, type: 4, count: 1, value: exifIfd },
            { tag: TAG_GPS_IFD, type: 4, count: 1, value: gpsIfd },
            { tag: TAG_TITLE, type: 1, count: 12, value: latin1('T\0i\0t\0l\0e\0\0\0') },
            { tag: TAG_PRINT_IM, type: 7, count: 4, value: latin1('PIM1') },
        ],
        [{ tag: 0x9003, type: 2, count: 20, value: latin1('2026:10:03 12:00:00\0') }],
        [
            { tag: 0x0001, type: 2, count: 2, value: latin1('N\0') },
            { tag: 0x0002, type: 5, count: 3, value: latitude },
        ],
        [
            { tag: 0x0201, type: 4, count: 1, value: thumbnail },
            { tag: 0x0202, type: 4, count: 1, value: THUMBNAIL.length },
        ],
    ];
    // Laid out once to learn where each IFD lands, then again pointing at them.
    const { offsets, tail } = layOutTiff(littleEndian, ifds(0, 0, 0));
    return layOutTiff(littleEndian, ifds(offsets[1] ?? 0, offsets[2] ?? 0, tail)).bytes;
}

/** A TIFF structure: each IFD followed by its values, IFD0 linked to the last IFD, then the thumbnail. */
function layOutTiff(
    littleEndian: boolean,
    ifds: TiffEntry[][]
): { bytes: Uint8Array; offsets: number[]; tail: number } {
    const bytes = new Uint8Array(1024);
    const view = new DataView(bytes.buffer);
    bytes.set(latin1(littleEndian ? 'II' : 'MM'));
    view.setUint16(2, 42, littleEndian);
    view.setUint32(4, 8, littleEndian);
    const offsets: number[] = [];
    let at = 8;
    for (const entries of ifds) {
        offsets.push(at);
        view.setUint16(at, entries.length, littleEndian);
        let data = at + 2 + entries.length * 12 + 4;
        entries.forEach(({ tag, type, count, value }, i) => {
            const entry = at + 2 + i * 12;
            view.setUint16(entry, tag, littleEndian);
            view.setUint16(entry + 2, type, littleEndian);
            view.setUint32(entry + 4, count, littleEndian);
            if (typeof value === 'number') {
                view.setUint32(entry + 8, value, littleEndian);
            } else if (value.length <= 4) {
                bytes.set(value, entry + 8);
            } else {
                view.setUint32(entry + 8, data, littleEndian);
                bytes.set(value, data);
                data += value.length;
            }
        });
        at = data;
    }
    const ifd0Count = ifds[0]?.length ?? 0;
    view.setUint32(8 + 2 + ifd0Count * 12, offsets.at(-1) ?? 0, littleEndian);
    bytes.set(THUMBNAIL, at);
    return { bytes: bytes.slice(0, at + THUMBNAIL.length), offsets, tail: at };
}

/** IFD0's tags, the XPTitle tag's value, and IFD1's thumbnail, from a TIFF structure that may open with `Exif\0\0`. */
function readExif(block: Uint8Array): {
    tags: number[];
    title: Uint8Array;
    thumbnail: Uint8Array;
} {
    const tiff =
        Buffer.from(block).toString('latin1', 0, 4) === 'Exif'
            ? block.subarray(6)
            : block;
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const littleEndian = view.getUint16(0) === 0x4949;
    const entries = (ifd: number): number[] =>
        Array.from(
            { length: view.getUint16(ifd, littleEndian) },
            (_, i) => ifd + 2 + i * 12
        );
    const value = (entry: number | undefined, length: number): Uint8Array => {
        const offset = entry === undefined ? 0 : view.getUint32(entry + 8, littleEndian);
        return tiff.slice(offset, offset + length);
    };
    const tagOf = (entry: number): number => view.getUint16(entry, littleEndian);
    const ifd0 = entries(view.getUint32(4, littleEndian));
    const ifd1Offset = view.getUint32((ifd0.at(-1) ?? 0) + 12, littleEndian);
    const ifd1 = entries(ifd1Offset);
    const thumbnailEntry = ifd1.find((entry) => tagOf(entry) === 0x0201);
    const lengthEntry = ifd1.find((entry) => tagOf(entry) === 0x0202) ?? 0;
    return {
        tags: ifd0.map(tagOf),
        title: value(
            ifd0.find((entry) => tagOf(entry) === TAG_TITLE),
            12
        ),
        thumbnail: value(thumbnailEntry, view.getUint32(lengthEntry + 8, littleEndian)),
    };
}

/**
 * A HEIF file whose one item is an EXIF block carrying GPS data, placed by an
 * `iloc` box of `version`: in an `idat` box (method 1) or an `mdat` box (method 0).
 */
function heifWithExifItem({
    version,
    method,
    dataReferenceIndex,
}: {
    version: number;
    method: number;
    dataReferenceIndex: number;
}): Uint8Array {
    // An Exif item opens with the offset from after itself to the TIFF header.
    const payload = concat(u32(6), latin1('Exif\0\0'), exifTiff(false));
    const ftyp = box('ftyp', latin1('heic'), u32(0), latin1('mif1heic'));
    const meta = (offset: number): Uint8Array =>
        fullBox(
            'meta',
            0,
            fullBox(
                'iinf',
                0,
                u16(1),
                fullBox('infe', 2, u16(1), u16(0), latin1('Exif\0'))
            ),
            fullBox(
                'iloc',
                version,
                // Offset and length sizes 4; base offset and index sizes 0.
                new Uint8Array([0x44, 0x00]),
                version === 2 ? u32(1) : u16(1),
                version === 2 ? u32(1) : u16(1),
                version === 0 ? new Uint8Array() : u16(method),
                u16(dataReferenceIndex),
                u16(1),
                u32(offset),
                u32(payload.length)
            ),
            method === 1 ? box('idat', payload) : new Uint8Array()
        );
    if (method === 1) return concat(ftyp, meta(0));
    const offset = ftyp.length + meta(0).length + 8;
    return concat(ftyp, meta(offset), box('mdat', payload));
}

/**
 * A HEIF file of items of `type`, one for each of `extents`, which the `iloc`
 * box places in `payload` in an `mdat` box. A `mime` item is declared as uncompressed XMP.
 */
function heifWithItems(
    type: 'Exif' | 'mime',
    payload: Uint8Array,
    extents: { offset: number; length: number }[]
): Uint8Array {
    const ids = extents.map((_, i) => i + 1);
    // An empty item name, then for XMP the content type, each ending in 0.
    const names = latin1(type === 'mime' ? '\0application/rdf+xml\0' : '\0');
    const ftyp = box('ftyp', latin1('heic'), u32(0), latin1('mif1heic'));
    const meta = (base: number): Uint8Array =>
        fullBox(
            'meta',
            0,
            fullBox(
                'iinf',
                0,
                u16(ids.length),
                ...ids.map((id) =>
                    fullBox('infe', 2, u16(id), u16(0), latin1(type), names)
                )
            ),
            fullBox(
                'iloc',
                0,
                // Offset and length sizes 4; base offset and index sizes 0.
                new Uint8Array([0x44, 0x00]),
                u16(ids.length),
                // Each item: its id, data reference index 0, one extent of offset and length.
                ...extents.map(({ offset, length }, i) =>
                    concat(u16(i + 1), u16(0), u16(1), u32(base + offset), u32(length))
                )
            )
        );
    const base = ftyp.length + meta(0).length + 8;
    return concat(ftyp, meta(base), box('mdat', payload));
}

/** `count` extents that each cover the whole of `payload`. */
function sharedExtents(
    count: number,
    payload: Uint8Array
): { offset: number; length: number }[] {
    return Array.from({ length: count }, () => ({ offset: 0, length: payload.length }));
}

/** An ImageMagick raw profile: a newline, the name, the length padded to 8, then hex lines of 72 digits. */
function rawProfile(name: string, profile: Uint8Array): Buffer {
    const hex = Buffer.from(profile).toString('hex');
    const lines = hex.match(/.{1,72}/g) ?? [];
    return Buffer.from(
        `\n${name}\n${String(profile.length).padStart(8)}\n${lines.join('\n')}\n`,
        'latin1'
    );
}

/** The bytes of an ImageMagick raw profile. */
function readRawProfile(text: string): Uint8Array {
    const [, , length, ...lines] = text.split('\n');
    const hex = lines.join('').replace(/\s/g, '');
    return new Uint8Array(Buffer.from(hex.slice(0, Number(length) * 2), 'hex'));
}

/**
 * An XMP packet with a GPS latitude, the same packet blanked, and a zlib stream
 * of the packet such that the blanked packet compresses to between 1 and 4
 * bytes short of filling the same length: too little room for a 5-byte stored block.
 */
async function packetCompressingShort(): Promise<{
    packet: string;
    blanked: string;
    stream: Uint8Array;
}> {
    const withLatitude = (latitude: string): string =>
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
        '<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
        `xmlns:dc="http://purl.org/dc/elements/1.1/" exif:GPSLatitude="${latitude}">` +
        '<dc:rights>Example Rights</dc:rights>' +
        '</rdf:Description></rdf:RDF></x:xmpmeta>';
    for (let digits = 1; digits <= 20; digits++) {
        const packet = withLatitude('5'.repeat(digits));
        const blanked = withLatitude(' '.repeat(digits));
        const recompressed = await compressedLength(blanked);
        for (let level = 1; level <= 9; level++) {
            const stream = deflateSync(packet, { level });
            const room = stream.length - 6 - recompressed;
            if (room >= 1 && room <= 4) return { packet, blanked, stream };
        }
    }
    throw new Error('no packet compresses to 1 to 4 bytes short');
}

/** The length of `text` compressed raw, as CompressionStream compresses it. */
async function compressedLength(text: string): Promise<number> {
    const compressed = await new Response(
        new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer();
    return compressed.byteLength - 6;
}

/** A 40x20 grey JPEG with no metadata. */
async function plainJpeg(): Promise<Uint8Array> {
    return new Uint8Array(
        await sharpLib({
            create: { width: 40, height: 20, channels: 3, background: '#808080' },
        })
            .jpeg()
            .toBuffer()
    );
}

/** An 8x8 grey PNG with no metadata. */
async function plainPng(): Promise<Uint8Array> {
    return new Uint8Array(
        await sharpLib({
            create: { width: 8, height: 8, channels: 3, background: '#808080' },
        })
            .png()
            .toBuffer()
    );
}

/** A PNG chunk of `type` whose data is `prefix` in Latin-1 and then `body`, with its CRC. */
function pngChunk(type: string, prefix: string, body: Uint8Array): Uint8Array {
    const data = concat(latin1(prefix), body);
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(latin1(type), 4);
    chunk.set(data, 8);
    view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
    return chunk;
}

/** `png` with `chunks` after its 8-byte signature and 25-byte IHDR chunk. */
function withPngChunks(png: Uint8Array, chunks: Uint8Array[]): Uint8Array {
    return concat(png.subarray(0, 33), ...chunks, png.subarray(33));
}

/** Each chunk of a PNG, its data as Latin-1. */
function readPngChunks(png: Uint8Array): { type: string; data: string }[] {
    const bytes = Buffer.from(png);
    const chunks: { type: string; data: string }[] = [];
    for (let offset = 8; offset + 12 <= bytes.length; ) {
        const length = bytes.readUInt32BE(offset);
        chunks.push({
            type: bytes.toString('latin1', offset + 4, offset + 8),
            data: bytes.toString('latin1', offset + 8, offset + 8 + length),
        });
        offset += 12 + length;
    }
    return chunks;
}

/** The text of the first PNG chunk of `type`, inflated from after its first `skip` bytes. */
function inflatedText(png: Uint8Array, type: string, skip: number): string {
    const chunk = readPngChunks(png).find((c) => c.type === type);
    const data = Buffer.from(chunk?.data ?? '', 'latin1').subarray(skip);
    return inflateSync(data).toString('utf8');
}

/** A JPEG marker segment: the marker, its length, then `payload`. */
function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
    return concat(new Uint8Array([0xff, marker]), u16(payload.length + 2), payload);
}

/** An ISO base media box of `type` holding `parts`. */
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
    const body = concat(...parts);
    return concat(u32(8 + body.length), latin1(type), body);
}

/** A full box: a version byte and three flag bytes before `parts`. */
function fullBox(type: string, version: number, ...parts: Uint8Array[]): Uint8Array {
    return box(type, new Uint8Array([version, 0, 0, 0]), ...parts);
}

function u16(value: number): Uint8Array {
    return new Uint8Array([value >> 8, value & 0xff]);
}

function u32(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value);
    return bytes;
}

function latin1(text: string): Uint8Array {
    return new Uint8Array(Buffer.from(text, 'latin1'));
}

function concat(...parts: Uint8Array[]): Uint8Array {
    return new Uint8Array(Buffer.concat(parts));
}
