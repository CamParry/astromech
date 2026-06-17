import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig, makeTestConfig } from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { mediaApi } from '@/services/media/service.js';
import type { StorageDriver } from '@/types/index.js';

// Minimal 1x1 JPEG (SOI + APP0 + SOF0 + EOI) — an optimisable raster image.
function jpegBytes(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
        0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
}

type PutRecord = { key: string; streamed: boolean };

function makeTrackingStorage(): StorageDriver & {
    keys: Set<string>;
    puts: PutRecord[];
    deletes: string[];
} {
    const store = new Map<string, Uint8Array>();
    const puts: PutRecord[] = [];
    const deletes: string[] = [];

    async function drain(stream: ReadableStream): Promise<Uint8Array> {
        const reader = (stream as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            out.set(c, off);
            off += c.length;
        }
        return out;
    }

    return {
        name: 'tracking',
        keys: new Set(store.keys()),
        puts,
        deletes,
        async put(key, body) {
            const streamed = !(body instanceof Uint8Array);
            puts.push({ key, streamed });
            store.set(key, body instanceof Uint8Array ? body : await drain(body));
            this.keys = new Set(store.keys());
        },
        async get(key) {
            const bytes = store.get(key);
            if (!bytes) return null;
            const body = new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(bytes);
                    c.close();
                },
            });
            return { body, size: bytes.length };
        },
        async delete(key) {
            deletes.push(key);
            store.delete(key);
            this.keys = new Set(store.keys());
        },
        async list(prefix) {
            return [...store.keys()].filter((k) => k.startsWith(prefix));
        },
        getDirectUrl: () => null,
    };
}

let storage: ReturnType<typeof makeTrackingStorage>;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    storage = makeTrackingStorage();
    setStorageDriver(storage);
});

describe('mediaApi.upload', () => {
    it('buffers an image and records dimensions + version', async () => {
        const media = await mediaApi.upload(
            new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        expect(media.width).toBe(1);
        expect(media.height).toBe(1);
        expect(media.metadata?.version).toMatch(/^[0-9a-f]{12}$/);
        // Image path buffers (Uint8Array put), not streamed.
        expect(storage.puts.at(-1)?.streamed).toBe(false);
    });

    it('streams a non-image straight to storage (never buffered)', async () => {
        const media = await mediaApi.upload(
            new File(['hello world' as BlobPart], 'notes.txt', { type: 'text/plain' })
        );
        expect(media.width).toBeNull();
        expect(media.height).toBeNull();
        expect(media.metadata?.version).toBeUndefined();
        expect(storage.puts.at(-1)?.streamed).toBe(true);
    });
});

describe('mediaApi.replace', () => {
    it('purges variants and overwrites when the extension is unchanged', async () => {
        const m = await mediaApi.upload(
            new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        // Simulate a cached variant for this item.
        await storage.put(
            `variants/${m.id}/${m.metadata?.version}/320.webp`,
            new Uint8Array([1])
        );

        await mediaApi.replace(
            m.id,
            new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );

        expect(storage.keys.has(`${m.id}.jpg`)).toBe(true);
        // Old variant purged via deletePrefix.
        expect([...storage.keys].some((k) => k.startsWith(`variants/${m.id}/`))).toBe(
            false
        );
    });

    it('deletes the old original when the extension changes', async () => {
        const m = await mediaApi.upload(
            new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' })
        );
        expect(storage.keys.has(`${m.id}.jpg`)).toBe(true);

        await mediaApi.replace(
            m.id,
            new File([jpegBytes() as BlobPart], 'photo.png', { type: 'image/png' })
        );

        expect(storage.deletes).toContain(`${m.id}.jpg`);
        expect(storage.keys.has(`${m.id}.jpg`)).toBe(false);
        expect(storage.keys.has(`${m.id}.png`)).toBe(true);
    });
});
