/**
 * What the filesystem driver does beyond the contract every driver keeps
 * (`tests/storage/drivers/contract.test.ts`): its range past the end, a missing
 * directory, its cursor, its public URLs and that it cannot sign.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesystem } from '@/storage/drivers/filesystem';

async function drain(stream: ReadableStream): Promise<Uint8Array> {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
        const result = await reader.read();
        if (result.done) {
            done = true;
        } else {
            chunks.push(result.value);
        }
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

let dir: string;
let driver: ReturnType<typeof filesystem>;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-fs-storage-'));
    driver = filesystem({ dir });
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('filesystem()', () => {
    describe('name', () => {
        it('is "filesystem"', () => {
            expect(driver.name).toBe('filesystem');
        });
    });

    describe('get with a range', () => {
        beforeEach(async () => {
            await driver.put('video.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
        });

        it('returns an empty body for an offset past the end', async () => {
            const result = await driver.get('video.mp4', {
                range: { offset: 99, length: 4 },
            });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([]));
            expect(result.size).toBe(0);
            expect(result.totalSize).toBe(8);
        });
    });

    describe('list', () => {
        it('returns an empty page for a directory that does not exist', async () => {
            expect(await filesystem({ dir: join(dir, 'nope') }).list('')).toEqual({
                keys: [],
            });
        });

        it('paginates with a cursor across two pages', async () => {
            for (const n of [1, 2, 3, 4, 5]) {
                await driver.put(`variants/w${n}.jpg`, new Uint8Array([n]));
            }

            const first = await driver.list('variants/', { limit: 2 });
            expect(first.keys).toEqual(['variants/w1.jpg', 'variants/w2.jpg']);
            expect(first.cursor).toBe('variants/w2.jpg');
            if (first.cursor === undefined) throw new Error('expected a cursor');

            const second = await driver.list('variants/', {
                limit: 2,
                cursor: first.cursor,
            });
            expect(second.keys).toEqual(['variants/w3.jpg', 'variants/w4.jpg']);
            expect(second.cursor).toBe('variants/w4.jpg');
            if (second.cursor === undefined) throw new Error('expected a cursor');

            const third = await driver.list('variants/', {
                limit: 2,
                cursor: second.cursor,
            });
            expect(third.keys).toEqual(['variants/w5.jpg']);
            expect(third.cursor).toBeUndefined();
        });
    });

    describe('getPublicUrl', () => {
        it('returns null without a urlPrefix — nothing proves dir is web-served', () => {
            expect(driver.getPublicUrl?.('photo.jpg')).toBeNull();
        });

        it('strips a trailing slash rather than emitting a double slash', () => {
            const custom = filesystem({ dir, urlPrefix: '/media/' });
            expect(custom.getPublicUrl?.('photo.jpg')).toBe('/media/photo.jpg');
        });

        it('honours a configured urlPrefix', () => {
            const custom = filesystem({ dir, urlPrefix: '/media' });
            expect(custom.getPublicUrl?.('nested/photo.jpg')).toBe(
                '/media/nested/photo.jpg'
            );
        });
    });

    describe('signing capabilities', () => {
        it('exposes none — the filesystem cannot sign', () => {
            expect(driver.getSignedUploadUrl).toBeUndefined();
            expect(driver.getSignedDownloadUrl).toBeUndefined();
        });
    });
});
