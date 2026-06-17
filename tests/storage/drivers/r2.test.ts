import { describe, it, expect, beforeEach } from 'vitest';
import { r2 } from '@/storage/drivers/r2.js';
import type { R2BucketLike } from '@/storage/drivers/r2.js';

// ---------------------------------------------------------------------------
// In-memory R2 fake
// ---------------------------------------------------------------------------

type StoredObject = { bytes: Uint8Array; contentType?: string };

function makeFakeBucket(opts?: {
    /** If set, the first list() call returns only `firstPageKeys` and sets truncated=true */
    firstPageKeys?: string[];
    secondPageKeys?: string[];
}): R2BucketLike & { store: Map<string, StoredObject>; listCallCount: number } {
    const store = new Map<string, StoredObject>();
    let listCallCount = 0;

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

        async get(key: string): Promise<{
            body: ReadableStream;
            size: number;
            httpMetadata?: { contentType?: string };
        } | null> {
            const entry = store.get(key);
            if (!entry) return null;
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(entry.bytes);
                    controller.close();
                },
            });
            if (entry.contentType !== undefined) {
                return {
                    body,
                    size: entry.bytes.length,
                    httpMetadata: { contentType: entry.contentType },
                };
            }
            return { body, size: entry.bytes.length };
        },

        async delete(key: string): Promise<void> {
            store.delete(key);
        },

        async list(listOpts?: {
            prefix?: string;
            cursor?: string;
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
            expect(result.contentType).toBe('image/jpeg');
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

            const keys = await driver.list('variants/abc/');
            expect(keys.sort()).toEqual([
                'variants/abc/w400.jpg',
                'variants/abc/w800.jpg',
            ]);
        });

        it('returns an empty array when no keys match', async () => {
            await driver.put('something/else.txt', new Uint8Array([1]));
            expect(await driver.list('variants/')).toEqual([]);
        });

        it('handles two-page truncated response and returns all keys', async () => {
            const page1 = ['variants/abc/w400.jpg', 'variants/abc/w800.jpg'];
            const page2 = ['variants/abc/w1200.jpg', 'variants/abc/w1600.jpg'];

            const pagedBucket = makeFakeBucket({
                firstPageKeys: page1,
                secondPageKeys: page2,
            });
            const pagedDriver = r2({ bucket: pagedBucket });

            const keys = await pagedDriver.list('variants/abc/');

            expect(keys.sort()).toEqual([...page1, ...page2].sort());
            // Confirm list was called twice (pagination loop executed)
            expect(pagedBucket.listCallCount).toBe(2);
        });
    });

    describe('getDirectUrl', () => {
        it('returns publicUrl/key when publicUrl is configured', () => {
            const driver = r2({
                bucket: makeFakeBucket(),
                publicUrl: 'https://assets.example.com',
            });
            expect(driver.getDirectUrl?.('uploads/photo.jpg')).toBe(
                'https://assets.example.com/uploads/photo.jpg'
            );
        });

        it('returns null when publicUrl is not configured', () => {
            const driver = r2({ bucket: makeFakeBucket() });
            expect(driver.getDirectUrl?.('uploads/photo.jpg')).toBeNull();
        });
    });
});
