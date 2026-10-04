/**
 * `readImageDimensions` and `readImageMetadata` run on every uploaded image, so
 * a damaged or hostile file must never make them throw. Each case starts from a real
 * file in one of the formats it parses, with the orientation blocks it reads,
 * then cuts it short and overwrites bytes at random.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fc from 'fast-check';
import sharpLib from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { readImageDimensions } from '@/media/serving/image/dimensions';
import { readImageMetadata } from '@/media/serving/image/metadata';

const files: Uint8Array[] = [];
/** Each file's upright size as sharp reads it, an oracle independent of the reader. */
const uprightSizes: { width: number; height: number }[] = [];

beforeAll(async () => {
    for (const format of ['jpeg', 'png', 'webp', 'tiff', 'avif'] as const) {
        const bytes = await sharpLib({
            create: { width: 40, height: 20, channels: 3, background: '#808080' },
        })
            .toFormat(format)
            .withMetadata({ orientation: 6 })
            .toBuffer();
        files.push(new Uint8Array(bytes));
    }
    for (const name of ['grid-1200x800.heic', 'big-endian-6x4.tiff']) {
        const bytes = await readFile(join(import.meta.dirname, 'fixtures', name));
        files.push(new Uint8Array(bytes));
    }
    for (const file of files) {
        const { autoOrient } = await sharpLib(file).metadata();
        uprightSizes.push(autoOrient);
    }
});

describe('readImageDimensions over damaged files', () => {
    it('returns null or a size, and never throws', () => {
        fc.assert(
            fc.property(
                fc.nat(),
                fc.nat(),
                fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
                    maxLength: 8,
                }),
                (pick, cut, writes) => {
                    const file = files[pick % files.length] ?? new Uint8Array();
                    const bytes = file.slice(0, cut % (file.length + 1));
                    for (const [at, value] of writes) {
                        if (bytes.length > 0) bytes[at % bytes.length] = value;
                    }

                    const dimensions = readImageDimensions(bytes);

                    expect(
                        dimensions === null ||
                            (Number.isInteger(dimensions.width) &&
                                Number.isInteger(dimensions.height))
                    ).toBe(true);
                }
            ),
            { numRuns: 2000 }
        );
    });

    // A cut can lose the orientation block, which may follow the image data, but
    // never makes up a size the file does not hold.
    it('gives null, the upright size or the unrotated size for a file cut short', () => {
        fc.assert(
            fc.property(fc.nat(), fc.nat(), (pick, cut) => {
                const index = pick % files.length;
                const file = files[index] ?? new Uint8Array();
                const upright = uprightSizes[index];
                const bytes = file.slice(0, cut % (file.length + 1));

                const dimensions = readImageDimensions(bytes);

                expect([
                    null,
                    upright,
                    upright && { width: upright.height, height: upright.width },
                ]).toContainEqual(dimensions);
            }),
            { numRuns: 2000 }
        );
    });
});

describe('readImageMetadata over damaged files', () => {
    it('returns a boolean or nothing for each key, and never throws', () => {
        fc.assert(
            fc.property(
                fc.nat(),
                fc.nat(),
                fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
                    maxLength: 8,
                }),
                (pick, cut, writes) => {
                    const file = files[pick % files.length] ?? new Uint8Array();
                    const bytes = file.slice(0, cut % (file.length + 1));
                    for (const [at, value] of writes) {
                        if (bytes.length > 0) bytes[at % bytes.length] = value;
                    }

                    const { hasAlpha, animated } = readImageMetadata(bytes);

                    expect([undefined, true, false]).toContain(hasAlpha);
                    expect([undefined, true, false]).toContain(animated);
                }
            ),
            { numRuns: 2000 }
        );
    });
});
