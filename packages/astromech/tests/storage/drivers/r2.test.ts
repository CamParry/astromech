/**
 * What the R2 driver does beyond the contract every driver keeps
 * (`tests/storage/drivers/contract.test.ts`): it maps R2's own object metadata,
 * builds public URLs, cannot sign, and resolves a named binding lazily. The
 * bucket is the one wrangler emulates locally for the `MEDIA` binding; each
 * test writes under a key prefix of its own, because it keeps its objects.
 */

import type { R2BucketLike } from '@/storage/drivers/r2';
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
/** This test's own key prefix. */
let ns: string;

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

beforeEach(() => {
    ns = crypto.randomUUID();
});

afterEach(async () => {
    await deletePrefix(r2({ bucket }), `${ns}/`);
});

/** Every byte a body holds. */
async function bytesOf(body: ReadableStream): Promise<Uint8Array> {
    return new Uint8Array(await new Response(body).arrayBuffer());
}

describe('r2()', () => {
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
