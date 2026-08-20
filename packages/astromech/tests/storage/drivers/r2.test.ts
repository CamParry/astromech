import type { R2BucketLike } from '@/storage/drivers/r2';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetBindingEnv, setBindingEnv } from '@/cloudflare/bindings';
import { r2 } from '@/storage/drivers/r2';

type StoredObject = { bytes: Uint8Array; contentType?: string };

const UPLOADED = new Date('2026-07-28T12:00:00.000Z');

function makeFakeBucket(opts?: {
    /** If set, the first list() call returns only `firstPageKeys` and sets truncated=true */
    firstPageKeys?: string[];
    secondPageKeys?: string[];
}): R2BucketLike & { store: Map<string, StoredObject>; listCallCount: number } {
    const store = new Map<string, StoredObject>();
    let listCallCount = 0;

    /** Metadata as R2 reports it: `size` is always the FULL object size. */
    function meta(key: string, entry: StoredObject) {
        return {
            size: entry.bytes.length,
            httpEtag: `"etag-${key}"`,
            uploaded: UPLOADED,
            ...(entry.contentType !== undefined
                ? { httpMetadata: { contentType: entry.contentType } }
                : {}),
        };
    }

    return {
        store,
        get listCallCount() {
            return listCallCount;
        },

        async put(
            key: string,
            value: ReadableStream | ArrayBuffer | ArrayBufferView,
            options?: { httpMetadata?: { contentType?: string } }
        ): Promise<unknown> {
            let bytes: Uint8Array;
            if (value instanceof Uint8Array) {
                bytes = value;
            } else if (value instanceof ArrayBuffer) {
                bytes = new Uint8Array(value);
            } else if (ArrayBuffer.isView(value)) {
                bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            } else {
                // ReadableStream — consume it
                const reader = (value as ReadableStream<Uint8Array>).getReader();
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
                bytes = new Uint8Array(total);
                let offset = 0;
                for (const chunk of chunks) {
                    bytes.set(chunk, offset);
                    offset += chunk.length;
                }
            }
            const contentType = options?.httpMetadata?.contentType;
            if (contentType !== undefined) {
                store.set(key, { bytes, contentType });
            } else {
                store.set(key, { bytes });
            }
            return undefined;
        },

        async head(key: string) {
            const entry = store.get(key);
            return entry ? meta(key, entry) : null;
        },

        async get(
            key: string,
            getOpts?: { range?: { offset: number; length?: number } }
        ) {
            const entry = store.get(key);
            if (!entry) return null;
            const range = getOpts?.range;
            const slice =
                range === undefined
                    ? entry.bytes
                    : entry.bytes.slice(
                          range.offset,
                          range.length === undefined
                              ? undefined
                              : range.offset + range.length
                      );
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(slice);
                    controller.close();
                },
            });
            // R2 reports the FULL object size even when a range was requested.
            return { ...meta(key, entry), body };
        },

        async delete(key: string): Promise<void> {
            store.delete(key);
        },

        async list(listOpts?: {
            prefix?: string;
            cursor?: string;
            limit?: number;
        }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }> {
            listCallCount++;
            const prefix = listOpts?.prefix ?? '';
            const cursor = listOpts?.cursor;

            // Two-page mode: injected via opts
            if (opts?.firstPageKeys !== undefined) {
                if (!cursor) {
                    return {
                        objects: opts.firstPageKeys.map((k) => ({ key: k })),
                        truncated: true,
                        cursor: 'page2',
                    };
                }
                // second page
                return {
                    objects: (opts.secondPageKeys ?? []).map((k) => ({ key: k })),
                    truncated: false,
                };
            }

            // Normal mode: filter store by prefix
            const allKeys = [...store.keys()].filter((k) => k.startsWith(prefix));
            return {
                objects: allKeys.map((k) => ({ key: k })),
                truncated: false,
            };
        },
    };
}

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

describe('r2()', () => {
    describe('name', () => {
        it('is "r2"', () => {
            const driver = r2({ bucket: makeFakeBucket() });
            expect(driver.name).toBe('r2');
        });
    });

    describe('put / get round-trip', () => {
        it('stores bytes and retrieves them with contentType', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            const original = new Uint8Array([10, 20, 30, 40]);

            await driver.put('uploads/photo.jpg', original, {
                contentType: 'image/jpeg',
            });

            const result = await driver.get('uploads/photo.jpg');
            if (!result) throw new Error('expected a result');
            const bytes = await drain(result.body);
            expect(bytes).toEqual(original);
            expect(result.size).toBe(4);
            expect(result.totalSize).toBe(4);
            expect(result.contentType).toBe('image/jpeg');
            expect(result.etag).toBe('"etag-uploads/photo.jpg"');
        });

        it('returns null for a missing key', async () => {
            const driver = r2({ bucket: makeFakeBucket() });
            const result = await driver.get('does/not/exist');
            expect(result).toBeNull();
        });

        it('omits contentType from result when not stored', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            await driver.put('raw.bin', new Uint8Array([1, 2]));

            const result = await driver.get('raw.bin');
            if (!result) throw new Error('expected a result');
            expect('contentType' in result).toBe(false);
        });
    });

    describe('get with a range', () => {
        it('reports the slice length as size and the whole object as totalSize', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            await driver.put('video.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));

            const result = await driver.get('video.mp4', {
                range: { offset: 2, length: 3 },
            });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([2, 3, 4]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });

        it('clamps a length running past the end', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            await driver.put('video.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));

            const result = await driver.get('video.mp4', {
                range: { offset: 6, length: 100 },
            });
            if (!result) throw new Error('expected a result');
            expect(result.size).toBe(2);
            expect(result.totalSize).toBe(8);
        });

        it('reads to the end when length is omitted', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            await driver.put('video.mp4', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));

            const result = await driver.get('video.mp4', { range: { offset: 5 } });
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([5, 6, 7]));
            expect(result.size).toBe(3);
            expect(result.totalSize).toBe(8);
        });
    });

    describe('stat', () => {
        it('returns metadata without a body for a stored key', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });
            await driver.put('uploads/photo.jpg', new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });

            const info = await driver.stat('uploads/photo.jpg');
            expect(info).toEqual({
                size: 3,
                contentType: 'image/jpeg',
                etag: '"etag-uploads/photo.jpg"',
                uploadedAt: UPLOADED,
            });
        });

        it('returns null for a missing key', async () => {
            const driver = r2({ bucket: makeFakeBucket() });
            expect(await driver.stat('ghost.bin')).toBeNull();
        });
    });

    describe('delete', () => {
        it('removes a stored key so get returns null', async () => {
            const bucket = makeFakeBucket();
            const driver = r2({ bucket });

            await driver.put('to-delete.txt', new Uint8Array([5, 6]), {
                contentType: 'text/plain',
            });
            await driver.delete('to-delete.txt');

            expect(await driver.get('to-delete.txt')).toBeNull();
        });

        it('is a no-op for a non-existent key', async () => {
            const driver = r2({ bucket: makeFakeBucket() });
            await expect(driver.delete('ghost.txt')).resolves.toBeUndefined();
        });
    });

    describe('list', () => {
        let bucket: ReturnType<typeof makeFakeBucket>;
        let driver: ReturnType<typeof r2>;

        beforeEach(() => {
            bucket = makeFakeBucket();
            driver = r2({ bucket });
        });

        it('returns only keys matching the prefix', async () => {
            await driver.put('variants/abc/w400.jpg', new Uint8Array([1]));
            await driver.put('variants/abc/w800.jpg', new Uint8Array([2]));
            await driver.put('originals/abc.jpg', new Uint8Array([3]));

            const page = await driver.list('variants/abc/');
            expect(page.keys.sort()).toEqual([
                'variants/abc/w400.jpg',
                'variants/abc/w800.jpg',
            ]);
            expect(page.cursor).toBeUndefined();
        });

        it('returns an empty page when no keys match', async () => {
            await driver.put('something/else.txt', new Uint8Array([1]));
            expect(await driver.list('variants/')).toEqual({ keys: [] });
        });

        it('returns one page and surfaces the cursor when truncated', async () => {
            const page1 = ['variants/abc/w400.jpg', 'variants/abc/w800.jpg'];
            const page2 = ['variants/abc/w1200.jpg', 'variants/abc/w1600.jpg'];

            const pagedBucket = makeFakeBucket({
                firstPageKeys: page1,
                secondPageKeys: page2,
            });
            const pagedDriver = r2({ bucket: pagedBucket });

            const first = await pagedDriver.list('variants/abc/');
            expect(first.keys).toEqual(page1);
            expect(first.cursor).toBe('page2');
            // One call per list(): the driver does not loop internally.
            expect(pagedBucket.listCallCount).toBe(1);
            if (first.cursor === undefined) throw new Error('expected a cursor');

            const second = await pagedDriver.list('variants/abc/', {
                cursor: first.cursor,
            });
            expect(second.keys).toEqual(page2);
            expect(second.cursor).toBeUndefined();
            expect(pagedBucket.listCallCount).toBe(2);
        });

        it('passes limit through to the bucket', async () => {
            const seen: (number | undefined)[] = [];
            const spyBucket: R2BucketLike = {
                ...makeFakeBucket(),
                async list(listOpts) {
                    seen.push(listOpts?.limit);
                    return { objects: [], truncated: false };
                },
            };
            await r2({ bucket: spyBucket }).list('variants/', { limit: 25 });
            expect(seen).toEqual([25]);
        });
    });

    describe('getPublicUrl', () => {
        it('returns publicUrl/key when publicUrl is configured', () => {
            const driver = r2({
                bucket: makeFakeBucket(),
                publicUrl: 'https://assets.example.com',
            });
            expect(driver.getPublicUrl?.('uploads/photo.jpg')).toBe(
                'https://assets.example.com/uploads/photo.jpg'
            );
        });

        it('returns null when publicUrl is not configured', () => {
            const driver = r2({ bucket: makeFakeBucket() });
            expect(driver.getPublicUrl?.('uploads/photo.jpg')).toBeNull();
        });

        it('strips a trailing slash rather than emitting a double slash', () => {
            const driver = r2({
                bucket: makeFakeBucket(),
                publicUrl: 'https://assets.example.com/',
            });
            expect(driver.getPublicUrl?.('photo.jpg')).toBe(
                'https://assets.example.com/photo.jpg'
            );
        });
    });

    describe('signing capabilities', () => {
        it('exposes none — an R2 binding cannot sign', () => {
            const driver = r2({ bucket: makeFakeBucket() });
            expect(driver.getSignedUploadUrl).toBeUndefined();
            expect(driver.getSignedDownloadUrl).toBeUndefined();
        });
    });

    describe('binding form', () => {
        beforeEach(() => {
            resetBindingEnv();
        });

        it('round-trips put/get against a bucket supplied via setBindingEnv', async () => {
            const bucket = makeFakeBucket();
            setBindingEnv({ MEDIA: bucket });
            const driver = r2({ binding: 'MEDIA' });

            await driver.put('uploads/photo.jpg', new Uint8Array([1, 2, 3]), {
                contentType: 'image/jpeg',
            });
            const result = await driver.get('uploads/photo.jpg');
            if (!result) throw new Error('expected a result');
            expect(await drain(result.body)).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('constructing with an unknown binding name does not throw — resolution is deferred to first use', async () => {
            resetBindingEnv();
            setBindingEnv({ OTHER: makeFakeBucket() });

            expect(() => r2({ binding: 'MEDIA' })).not.toThrow();

            const driver = r2({ binding: 'MEDIA' });
            await expect(driver.get('any-key')).rejects.toThrow(
                "Cloudflare binding 'MEDIA' not found."
            );
        });

        it('does not memoise a failed lookup, so a later env still resolves', async () => {
            resetBindingEnv();
            setBindingEnv({ OTHER: makeFakeBucket() });
            const driver = r2({ binding: 'MEDIA' });
            await expect(driver.get('any-key')).rejects.toThrow(/not found/);

            const bucket = makeFakeBucket();
            resetBindingEnv();
            setBindingEnv({ MEDIA: bucket });
            await driver.put('photo.jpg', new TextEncoder().encode('bytes'));
            expect(await driver.get('photo.jpg')).not.toBeNull();
        });

        it('resolves the binding once across several method calls', async () => {
            let resolutions = 0;
            const bucket = makeFakeBucket();
            const env: Record<string, unknown> = {};
            Object.defineProperty(env, 'MEDIA', {
                enumerable: true,
                get() {
                    resolutions++;
                    return bucket;
                },
            });
            setBindingEnv(env);

            const driver = r2({ binding: 'MEDIA' });
            await driver.put('a.txt', new Uint8Array([1]));
            await driver.get('a.txt');
            await driver.stat('a.txt');
            await driver.delete('a.txt');
            await driver.list('');

            expect(resolutions).toBe(1);
        });

        it('getPublicUrl works on a binding-configured driver without any binding being resolvable', () => {
            resetBindingEnv();
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
