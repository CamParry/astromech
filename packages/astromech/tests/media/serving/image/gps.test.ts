import type { StorageDriver } from '@/types/index';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import {
    createTestDb,
    createTestStorage,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import sharpLib from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { handleMediaRequest } from '@/media/serving/handler';

const mediaService = currentServices.media;

/** IFD0 tags the tests look for. */
const TAG_MODEL = 0x0110;
const TAG_COPYRIGHT = 0x8298;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;

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
        const data = Buffer.concat([
            Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'),
            Buffer.from(xmp, 'utf8'),
        ]);
        const type = Buffer.from('iTXt', 'latin1');
        const chunk = Buffer.alloc(12 + data.length);
        chunk.writeUInt32BE(data.length, 0);
        type.copy(chunk, 4);
        data.copy(chunk, 8);
        chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
        // After the 8-byte signature and the 25-byte IHDR chunk.
        const original = new Uint8Array([
            ...plain.subarray(0, 33),
            ...chunk,
            ...plain.subarray(33),
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
