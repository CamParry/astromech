import { describe, expect, it } from 'vitest';
import { detectImageFormat } from '@/media/serving/image/header';

describe('detectImageFormat', () => {
    it.each([
        [64, 'heif'],
        [65, null],
    ] as const)(
        'reads at most 64 compatible brands of an ftyp box (HEIF brand at %i: %s)',
        (position, format) => {
            const brands = 'isom'.repeat(position - 1) + 'heic';
            const body = Buffer.from(`isom\0\0\0\0${brands}`, 'latin1');
            const bytes = new Uint8Array(8 + body.length);
            new DataView(bytes.buffer).setUint32(0, bytes.length);
            bytes.set(Buffer.from('ftyp', 'latin1'), 4);
            bytes.set(body, 8);

            expect(detectImageFormat(bytes)).toBe(format);
        }
    );
});
