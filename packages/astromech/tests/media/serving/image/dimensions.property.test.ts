/**
 * `readImageDimensions` runs on every uploaded image, so a damaged or hostile
 * file must give null or a size, never a throw. Each case starts from a real
 * file in one of the formats it parses, with the orientation blocks it reads,
 * then cuts it short and overwrites bytes at random.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fc from 'fast-check';
import sharpLib from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { readImageDimensions } from '@/media/serving/image/dimensions';

const files: Uint8Array[] = [];

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
});
