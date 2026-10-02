/**
 * The `StorageDriver` contract, run against every driver that can run here:
 * `filesystem` in a temp dir, and `r2` against the bucket wrangler emulates
 * locally for the `MEDIA` binding. `s3` needs an S3 server, so its own tests
 * stub `fetch` instead. Each test writes under a key prefix of its own, because
 * the emulated bucket keeps its objects between runs.
 *
 * What the R2 driver does beyond the contract (its own object metadata, public
 * URLs, no signing, lazy binding lookup) is tested at the end of this file, so
 * one file owns the wrangler proxy and its local R2 store.
 */

import type { R2BucketLike } from '@/storage/drivers/r2';
import type { StorageDriver } from '@/types/index';
import { createTestStorage } from '@tests/harness';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
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
    clearEnvSource();
    // The workerd process outlives the test run if the proxy is never disposed.
    await disposeBindings();
});

/** One driver under test, and where it differs from the others. */
type Row = {
    name: string;
    create: () => StorageDriver;
    /** Whether `get` answers the `contentType` a `put` gave. */
    storesContentType: boolean;
    /** Whether a `put` of a stream of unknown length fails, which is a defect. */
    refusesUnsizedStream: boolean;
};

const DRIVERS: Row[] = [
    {
        name: 'filesystem',
        create: () => createTestStorage(),
        storesContentType: false,
        refusesUnsizedStream: false,
    },
    {
        name: 'r2',
        create: () => r2({ bucket }),
        storesContentType: true,
        // Defect: roadmap/planned/r2-rejects-unsized-streams.md
        refusesUnsizedStream: true,
    },
];

/** Every byte a body holds. */
async function bytesOf(body: ReadableStream): Promise<Uint8Array> {
    return new Uint8Array(await new Response(body).arrayBuffer());
}

describe.each(DRIVERS)('$name', ({ create, storesContentType, refusesUnsizedStream }) => {
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

        // Expected to fail on r2: roadmap/planned/r2-rejects-unsized-streams.md
        (refusesUnsizedStream ? it.fails : it)(
            'takes a ReadableStream body of unknown length',
            async () => {
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new Uint8Array([7, 8, 9]));
                        controller.close();
                    },
                });
                await driver.put(`${ns}/streamed.bin`, body);
                const result = await driver.get(`${ns}/streamed.bin`);
                if (!result) throw new Error('expected a result');
                expect(await bytesOf(result.body)).toEqual(new Uint8Array([7, 8, 9]));
            }
        );

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

describe('r2()', () => {
    /** This test's own key prefix. */
    let ns: string;

    beforeEach(() => {
        ns = crypto.randomUUID();
    });

    afterEach(async () => {
        await deletePrefix(r2({ bucket }), `${ns}/`);
    });

    describe('name', () => {
        it('is "r2"', () => {
            expect(r2({ bucket }).name).toBe('r2');
        });
    });

    describe('object metadata', () => {
        it('answers a get with R2’s own etag', async () => {
            const driver = r2({ bucket });
            await driver.put(`${ns}/photo.jpg`, new Uint8Array([10, 20, 30, 40]), {
                contentType: 'image/jpeg',
            });

            const result = await driver.get(`${ns}/photo.jpg`);
            if (!result) throw new Error('expected a result');
            const head = await bucket.head(`${ns}/photo.jpg`);
            expect(result.etag).toBe(head?.httpEtag);
        });

        it('omits contentType from a get when none was stored', async () => {
            const driver = r2({ bucket });
            await driver.put(`${ns}/raw.bin`, new Uint8Array([1, 2]));

            const result = await driver.get(`${ns}/raw.bin`);
            if (!result) throw new Error('expected a result');
            expect('contentType' in result).toBe(false);
        });

        it('answers a stat with R2’s size, content type, etag and upload time', async () => {
            const driver = r2({ bucket });
            await driver.put(`${ns}/photo.jpg`, new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });

            const info = await driver.stat(`${ns}/photo.jpg`);
            const head = await bucket.head(`${ns}/photo.jpg`);
            expect(info).toEqual({
                size: 3,
                contentType: 'image/jpeg',
                etag: head?.httpEtag,
                uploadedAt: head?.uploaded,
            });
        });
    });

    describe('getPublicUrl', () => {
        it('returns publicUrl/key when publicUrl is configured', () => {
            const driver = r2({ bucket, publicUrl: 'https://assets.example.com' });
            expect(driver.getPublicUrl?.('uploads/photo.jpg')).toBe(
                'https://assets.example.com/uploads/photo.jpg'
            );
        });

        it('returns null when publicUrl is not configured', () => {
            expect(r2({ bucket }).getPublicUrl?.('uploads/photo.jpg')).toBeNull();
        });

        it('strips a trailing slash rather than emitting a double slash', () => {
            const driver = r2({ bucket, publicUrl: 'https://assets.example.com/' });
            expect(driver.getPublicUrl?.('photo.jpg')).toBe(
                'https://assets.example.com/photo.jpg'
            );
        });
    });

    describe('signing capabilities', () => {
        it('exposes none — an R2 binding cannot sign', () => {
            const driver = r2({ bucket });
            expect(driver.getSignedUploadUrl).toBeUndefined();
            expect(driver.getSignedDownloadUrl).toBeUndefined();
        });
    });

    // A registered environment is authoritative, so these name the bucket
    // through `setEnvSource` and never reach wrangler, whose proxy stays open.
    describe('binding form', () => {
        beforeEach(() => {
            clearEnvSource();
        });

        it('round-trips put/get against a bucket supplied via setEnvSource', async () => {
            setEnvSource({ MEDIA: bucket });
            const driver = r2({ binding: 'MEDIA' });

            await driver.put(`${ns}/photo.jpg`, new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });
            const result = await driver.get(`${ns}/photo.jpg`);
            if (!result) throw new Error('expected a result');
            expect(await bytesOf(result.body)).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('constructing with an unknown binding name does not throw — resolution is deferred to first use', async () => {
            setEnvSource({ OTHER: bucket });

            expect(() => r2({ binding: 'MEDIA' })).not.toThrow();

            const driver = r2({ binding: 'MEDIA' });
            await expect(driver.get(`${ns}/any-key`)).rejects.toThrow(
                "Cloudflare binding 'MEDIA' not found."
            );
        });

        it('does not memoise a failed lookup, so a later env still resolves', async () => {
            setEnvSource({ OTHER: bucket });
            const driver = r2({ binding: 'MEDIA' });
            await expect(driver.get(`${ns}/any-key`)).rejects.toThrow(/not found/);

            clearEnvSource();
            setEnvSource({ MEDIA: bucket });
            await driver.put(`${ns}/photo.jpg`, new TextEncoder().encode('bytes'));
            expect(await driver.get(`${ns}/photo.jpg`)).not.toBeNull();
        });

        it('resolves the binding once across several method calls', async () => {
            let resolutions = 0;
            const env: Record<string, unknown> = {};
            Object.defineProperty(env, 'MEDIA', {
                enumerable: true,
                get() {
                    resolutions++;
                    return bucket;
                },
            });
            setEnvSource(env);

            const driver = r2({ binding: 'MEDIA' });
            await driver.put(`${ns}/a.txt`, new Uint8Array([1]));
            await driver.get(`${ns}/a.txt`);
            await driver.stat(`${ns}/a.txt`);
            await driver.delete(`${ns}/a.txt`);
            await driver.list(`${ns}/`);

            expect(resolutions).toBe(1);
        });

        it('getPublicUrl works on a binding-configured driver without any binding being resolvable', () => {
            const driver = r2({
                binding: 'MEDIA',
                publicUrl: 'https://assets.example.com',
            });
            expect(driver.getPublicUrl?.('uploads/photo.jpg')).toBe(
                'https://assets.example.com/uploads/photo.jpg'
            );
        });
    });
});
