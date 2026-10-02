/**
 * The `StorageDriver` contract, run against every driver that can run here:
 * `filesystem` in a temp dir, and `r2` against the bucket wrangler emulates
 * locally for the `MEDIA` binding. `s3` needs an S3 server, so its own tests
 * stub `fetch` instead. Each test writes under a key prefix of its own, because
 * the emulated bucket keeps its objects between runs.
 */

import type { R2BucketLike } from '@/storage/drivers/r2';
import type { StorageDriver } from '@/types/index';
import { createTestStorage } from '@tests/harness';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearEnvSource } from '@/env';
import {
    disposeBindings,
    resetBindings,
    resolveBinding,
} from '@/integrations/cloudflare/bindings';
import { r2 } from '@/storage/drivers/r2';
import { deletePrefix } from '@/storage/prefix';

// Booting workerd for the first time is slow enough to blow the default.
const BOOT_TIMEOUT = 60_000;

let bucket: R2BucketLike;

beforeAll(async () => {
    // No env source, so the binding comes from wrangler's local emulation.
    clearEnvSource();
    resetBindings();
    bucket = await resolveBinding<R2BucketLike>('MEDIA');
}, BOOT_TIMEOUT);

afterAll(async () => {
    // The workerd process outlives the test run if the proxy is never disposed.
    await disposeBindings();
});

/** One driver under test, and where it differs from the others. */
type Row = {
    name: string;
    create: () => StorageDriver;
    /** Whether `get` answers the `contentType` a `put` gave. */
    storesContentType: boolean;
    /**
     * Whether a `put` takes a stream whose length is unknown. R2 refuses one:
     * a stream must come from a request or response body, or carry its length.
     */
    takesUnsizedStream: boolean;
};

const DRIVERS: Row[] = [
    {
        name: 'filesystem',
        create: () => createTestStorage(),
        storesContentType: false,
        takesUnsizedStream: true,
    },
    {
        name: 'r2',
        create: () => r2({ bucket }),
        storesContentType: true,
        takesUnsizedStream: false,
    },
];

/** Every byte a body holds. */
async function bytesOf(body: ReadableStream): Promise<Uint8Array> {
    return new Uint8Array(await new Response(body).arrayBuffer());
}

describe.each(DRIVERS)('$name', ({ create, storesContentType, takesUnsizedStream }) => {
    let driver: StorageDriver;
    /** This test's own key prefix. */
    let ns: string;

    beforeEach(() => {
        driver = create();
        ns = crypto.randomUUID();
    });

    afterEach(async () => {
        await deletePrefix(driver, `${ns}/`);
    });

    describe('put and get', () => {
        it('round-trips bytes under a nested key', async () => {
            const original = new Uint8Array([10, 20, 30, 40]);
            await driver.put(`${ns}/uploads/photo.jpg`, original, {
                contentType: 'image/jpeg',
            });

            const result = await driver.get(`${ns}/uploads/photo.jpg`);
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(original);
            expect(result.size).toBe(4);
            expect(result.totalSize).toBe(4);
            expect(result.contentType).toBe(storesContentType ? 'image/jpeg' : undefined);
        });

        it('takes a ReadableStream body of unknown length, except on r2', async () => {
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([7, 8, 9]));
                    controller.close();
                },
            });
            const put = driver.put(`${ns}/streamed.bin`, body);

            if (!takesUnsizedStream) {
                await expect(put).rejects.toThrow('must have a known length');
                return;
            }
            await put;
            const result = await driver.get(`${ns}/streamed.bin`);
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(new Uint8Array([7, 8, 9]));
        });

        it('answers null for a missing key', async () => {
            expect(await driver.get(`${ns}/does/not/exist`)).toBeNull();
        });
    });

    describe('get with a range', () => {
        beforeEach(async () => {
            await driver.put(`${ns}/video.mp4`, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
        });

        it('reports the slice length as size and the whole object as totalSize', async () => {
            const result = await driver.get(`${ns}/video.mp4`, {
                range: { offset: 2, length: 3 },
            });
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(new Uint8Array([2, 3, 4]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });

        it('clamps a length running past the end', async () => {
            const result = await driver.get(`${ns}/video.mp4`, {
                range: { offset: 6, length: 100 },
            });
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(new Uint8Array([6, 7]));
            expect(result.size).toBe(2);
            expect(result.totalSize).toBe(8);
        });

        it('reads to the end when length is omitted', async () => {
            const result = await driver.get(`${ns}/video.mp4`, { range: { offset: 5 } });
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(new Uint8Array([5, 6, 7]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });
    });

    describe('stat', () => {
        it('answers the size and upload time of a stored key, without a body', async () => {
            await driver.put(`${ns}/photo.jpg`, new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });

            const info = await driver.stat(`${ns}/photo.jpg`);
            expect(info?.size).toBe(3);
            expect(info?.uploadedAt).toBeInstanceOf(Date);
            expect(info?.contentType).toBe(storesContentType ? 'image/jpeg' : undefined);
            expect(info).not.toHaveProperty('body');
        });

        it('answers null for a missing key', async () => {
            expect(await driver.stat(`${ns}/ghost.bin`)).toBeNull();
        });
    });

    describe('delete', () => {
        it('removes a stored key so get answers null', async () => {
            await driver.put(`${ns}/to-delete.txt`, new Uint8Array([5, 6]));
            await driver.delete(`${ns}/to-delete.txt`);

            expect(await driver.get(`${ns}/to-delete.txt`)).toBeNull();
        });

        it('is a no-op for a missing key', async () => {
            await expect(driver.delete(`${ns}/ghost.txt`)).resolves.toBeUndefined();
        });
    });

    describe('list', () => {
        it('answers only the keys under the prefix', async () => {
            await driver.put(`${ns}/variants/abc/w400.jpg`, new Uint8Array([1]));
            await driver.put(`${ns}/variants/abc/w800.jpg`, new Uint8Array([2]));
            await driver.put(`${ns}/originals/abc.jpg`, new Uint8Array([3]));

            const page = await driver.list(`${ns}/variants/abc/`);
            expect(page.keys.sort()).toEqual([
                `${ns}/variants/abc/w400.jpg`,
                `${ns}/variants/abc/w800.jpg`,
            ]);
            expect(page.cursor).toBeUndefined();
        });

        it('answers an empty page when no key matches', async () => {
            await driver.put(`${ns}/something/else.txt`, new Uint8Array([1]));

            expect(await driver.list(`${ns}/variants/`)).toEqual({ keys: [] });
        });

        it('pages by `limit`, with a cursor while keys remain', async () => {
            const keys = ['a', 'b', 'c', 'd'].map((name) => `${ns}/v/${name}.jpg`);
            for (const key of keys) await driver.put(key, new Uint8Array([1]));

            const first = await driver.list(`${ns}/v/`, { limit: 2 });
            expect(first.keys).toHaveLength(2);
            if (first.cursor === undefined) throw new Error('expected a cursor');

            const second = await driver.list(`${ns}/v/`, {
                cursor: first.cursor,
                limit: 2,
            });
            expect(second.cursor).toBeUndefined();
            expect([...first.keys, ...second.keys].sort()).toEqual(keys);
        });
    });
});
