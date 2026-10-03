/**
 * `removeGpsMetadata` runs on every uploaded image and writes into its bytes,
 * so a damaged or hostile file must resolve, never reject, and keep its length.
 * Each case starts from a real file carrying EXIF and XMP GPS data, then cuts
 * it short and overwrites bytes at random.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fc from 'fast-check';
import sharpLib from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { removeGpsMetadata } from '@/media/serving/image/gps';

const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="51,30.2N">' +
    '<exif:GPSLongitude>0,7.0W</exif:GPSLongitude></rdf:Description></rdf:RDF></x:xmpmeta>';

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
    const heic = await readFile(
        join(import.meta.dirname, 'fixtures', 'grid-1200x800.heic')
    );
    files.push(new Uint8Array(heic));
});

describe('removeGpsMetadata over damaged files', () => {
    it('resolves and keeps the length', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.nat(),
                fc.nat(),
                fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
                    maxLength: 8,
                }),
                async (pick, cut, writes) => {
                    const file = files[pick % files.length] ?? new Uint8Array();
                    const bytes = file.slice(0, cut % (file.length + 1));
                    for (const [at, value] of writes) {
                        if (bytes.length > 0) bytes[at % bytes.length] = value;
                    }
                    const length = bytes.length;

                    await expect(removeGpsMetadata(bytes)).resolves.toBeUndefined();

                    expect(bytes.length).toBe(length);
                }
            ),
            { numRuns: 1000 }
        );
    });
});
