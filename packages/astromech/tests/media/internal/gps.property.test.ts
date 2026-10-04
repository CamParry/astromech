/**
 * `removeGpsMetadata` runs on every uploaded image and writes into its bytes.
 * Each damaged case starts from a real file carrying EXIF and XMP GPS data, then
 * cuts it short and overwrites bytes at random; the HEIF cases build `iloc` boxes.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import fc from 'fast-check';
import sharpLib from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { removeGpsMetadata } from '@/media/internal/gps';

const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="51,30.2N">' +
    '<exif:GPSLongitude>0,7.0W</exif:GPSLongitude></rdf:Description></rdf:RDF></x:xmpmeta>';

/** A JPEG and a PNG, which `imageData` can split, then the other formats. */
const files: Uint8Array[] = [];

beforeAll(async () => {
    for (const format of ['jpeg', 'png', 'webp', 'tiff', 'avif'] as const) {
        const bytes = await sharpLib({
            create: { width: 40, height: 20, channels: 3, background: '#808080' },
        })
            .toFormat(format)
            .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } })
            .withXmp(xmp)
            .toBuffer();
        files.push(new Uint8Array(bytes));
    }
    // The PNG also gets a compressed XMP chunk and an ImageMagick GPS text chunk.
    const png = files[1] ?? new Uint8Array();
    files[1] = new Uint8Array(
        Buffer.concat([
            png.subarray(0, 33),
            pngChunk(
                'zTXt',
                Buffer.concat([latin1('XML:com.adobe.xmp\0\0'), deflateSync(xmp)])
            ),
            pngChunk('tEXt', latin1('exif:GPSLatitude\x0051/1,30/1,0/1')),
            png.subarray(33),
        ])
    );
    const heic = await readFile(
        join(import.meta.dirname, '../serving/image/fixtures', 'grid-1200x800.heic')
    );
    files.push(new Uint8Array(heic));
});

/** One of the first `count` files, cut short and with up to 8 bytes overwritten. */
function damagedFile(count = Number.MAX_SAFE_INTEGER): fc.Arbitrary<Uint8Array> {
    return fc
        .tuple(
            fc.nat(),
            fc.nat(),
            fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
                maxLength: 8,
            })
        )
        .map(([pick, cut, writes]) => {
            const file = files[pick % Math.min(count, files.length)] ?? new Uint8Array();
            const bytes = file.slice(0, cut % (file.length + 1));
            for (const [at, value] of writes) {
                if (bytes.length > 0) bytes[at % bytes.length] = value;
            }
            return bytes;
        });
}

describe('removeGpsMetadata', () => {
    it('changes nothing when run a second time', async () => {
        await fc.assert(
            fc.asyncProperty(damagedFile(), async (bytes) => {
                await removeGpsMetadata(bytes);
                const once = bytes.slice();

                await removeGpsMetadata(bytes);

                expect(bytes).toEqual(once);
            }),
            { numRuns: 1000 }
        );
    });

    it('leaves a JPEG’s or PNG’s image data alone', async () => {
        await fc.assert(
            fc.asyncProperty(damagedFile(2), async (bytes) => {
                const before = imageData(bytes);

                await removeGpsMetadata(bytes);

                expect(imageData(bytes)).toEqual(before);
            }),
            { numRuns: 1000 }
        );
    });

    it('finishes quickly whatever a HEIF file’s iloc box declares', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    version: fc.integer({ min: 0, max: 2 }),
                    sizes: fc.array(fc.constantFrom(0, 4, 8), {
                        minLength: 4,
                        maxLength: 4,
                    }),
                    item: fc.uint8Array({ minLength: 6, maxLength: 24 }),
                    repeats: fc.integer({ min: 1, max: 65535 }),
                }),
                async ({ version, sizes, item, repeats }) => {
                    const [offset = 0, length = 0, base = 0, index = 0] = sizes;
                    const iloc = fullBox(
                        'iloc',
                        version,
                        new Uint8Array([(offset << 4) | length, (base << 4) | index]),
                        version === 2 ? u32(repeats) : u16(repeats),
                        ...Array.from({ length: repeats }, () => item)
                    );
                    const bytes = Buffer.concat([
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
                            iloc
                        ),
                    ]);

                    const started = performance.now();
                    await removeGpsMetadata(new Uint8Array(bytes));

                    expect(performance.now() - started).toBeLessThan(3000);
                }
            ),
            { numRuns: 100 }
        );
    });
});

/**
 * The bytes no metadata edit may touch: a JPEG's from its start-of-scan marker
 * on, or a PNG's `IDAT` chunks. Read without the code under test.
 */
function imageData(bytes: Uint8Array): Uint8Array[] {
    const buffer = Buffer.from(bytes);
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        for (let offset = 2; offset + 4 <= buffer.length && buffer[offset] === 0xff; ) {
            const marker = buffer[offset + 1];
            if (marker === 0xff) {
                offset += 1;
            } else if (marker === 0xda) {
                return [bytes.slice(offset)];
            } else {
                offset += 2 + buffer.readUInt16BE(offset + 2);
            }
        }
        return [];
    }
    const chunks: Uint8Array[] = [];
    for (let offset = 8; offset + 12 <= buffer.length; ) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('latin1', offset + 4, offset + 8);
        if (type === 'IDAT') chunks.push(bytes.slice(offset, offset + 12 + length));
        if (type === 'IEND') break;
        offset += 12 + length;
    }
    return chunks;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
    const typeBytes = latin1(type);
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return chunk;
}

function box(type: string, ...parts: Uint8Array[]): Buffer {
    const body = Buffer.concat(parts);
    return Buffer.concat([u32(8 + body.length), latin1(type), body]);
}

function fullBox(type: string, version: number, ...parts: Uint8Array[]): Buffer {
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

function latin1(text: string): Buffer {
    return Buffer.from(text, 'latin1');
}
