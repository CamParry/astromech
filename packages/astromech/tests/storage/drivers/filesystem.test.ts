import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesystem } from '@/storage/drivers/filesystem';

// ---------------------------------------------------------------------------
// Helper: drain a ReadableStream into Uint8Array
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    describe('put / get round-trip', () => {
        it('writes bytes under a nested key and reads them back', async () => {
            const original = new Uint8Array([10, 20, 30, 40]);
            await driver.put('uploads/photo.jpg', original, {
                contentType: 'image/jpeg',
            });

            const result = await driver.get('uploads/photo.jpg');
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(original);
            expect(result.size).toBe(4);
            expect(result.totalSize).toBe(4);
        });

        it('accepts a ReadableStream body', async () => {
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                    controller.close();
                },
            });
            await driver.put('streamed.bin', body);

            const result = await driver.get('streamed.bin');
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('returns null for a missing key', async () => {
            expect(await driver.get('does/not/exist')).toBeNull();
        });
    });

    describe('stat', () => {
        it('returns size and mtime for a stored key', async () => {
            await driver.put('uploads/photo.jpg', new Uint8Array([1, 2, 3]));

            const info = await driver.stat('uploads/photo.jpg');
            if (!info) throw new Error('expected stat');
            expect(info.size).toBe(3);
            expect(info.uploadedAt).toBeInstanceOf(Date);
            // The filesystem stores no contentType, so none is synthesised.
            expect(info.contentType).toBeUndefined();
        });

        it('returns null for a missing key', async () => {
            expect(await driver.stat('ghost.bin')).toBeNull();
        });
    });

    describe('get with a range', () => {
        beforeEach(async () => {
            await driver.put('video.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
        });

        it('returns the requested slice with the full size as totalSize', async () => {
            const result = await driver.get('video.mp4', {
                range: { offset: 2, length: 3 },
            });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([2, 3, 4]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });

        it('reads to the end when length is omitted', async () => {
            const result = await driver.get('video.mp4', { range: { offset: 5 } });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([5, 6, 7]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });

        it('clamps a length running past the end', async () => {
            const result = await driver.get('video.mp4', {
                range: { offset: 6, length: 100 },
            });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([6, 7]));
            expect(result.size).toBe(2);
            expect(result.totalSize).toBe(8);
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

    describe('delete', () => {
        it('removes a stored key so get returns null', async () => {
            await driver.put('to-delete.txt', new Uint8Array([5, 6]));
            await driver.delete('to-delete.txt');
            expect(await driver.get('to-delete.txt')).toBeNull();
        });

        it('is a no-op for a missing key', async () => {
            await expect(driver.delete('ghost.txt')).resolves.toBeUndefined();
        });
    });

    describe('list', () => {
        it('returns only keys matching the prefix', async () => {
            await driver.put('variants/abc/w400.jpg', new Uint8Array([1]));
            await driver.put('variants/abc/w800.jpg', new Uint8Array([2]));
            await driver.put('originals/abc.jpg', new Uint8Array([3]));

            const page = await driver.list('variants/abc/');
            expect(page.keys).toEqual(['variants/abc/w400.jpg', 'variants/abc/w800.jpg']);
            expect(page.cursor).toBeUndefined();
        });

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
