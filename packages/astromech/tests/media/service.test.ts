import type { StorageDriver } from '@/types/index';
import type { MockInstance } from 'vitest';
import { expectConsole } from '@tests/console';
import {
    createTestDb,
    createTestStorage,
    failWritesTo,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { mediaTable } from '@/database/tables';
import { listAll } from '@/storage/prefix';

const mediaService = currentServices.media;

// Minimal 1x1 JPEG (SOI + APP0 + SOF0 + EOI) — an optimisable raster image.
function jpegBytes(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
        0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
}

let storage: StorageDriver;

/** Whether `storage` holds `key`. */
async function stored(key: string): Promise<boolean> {
    return (await storage.stat(key)) !== null;
}

/** The text `storage` holds under `key`. */
async function readStored(key: string): Promise<string> {
    const object = await storage.get(key);
    if (!object) throw new Error(`expected ${key} in storage`);
    return new Response(object.body).text();
}

/** Whether the last `put` was handed a stream rather than buffered bytes. */
function lastPutStreamed(put: MockInstance<StorageDriver['put']>): boolean {
    return !(put.mock.calls.at(-1)?.[1] instanceof Uint8Array);
}

beforeEach(async () => {
    await createTestDb();
    storage = createTestStorage();
    setupTestConfig({ ...makeTestConfig(), storage });
});

describe('mediaService.upload', () => {
    it('buffers an image and records dimensions + version', async () => {
        const put = vi.spyOn(storage, 'put');
        const media = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        expect(media.width).toBe(1);
        expect(media.height).toBe(1);
        expect(media.metadata?.version).toMatch(/^[0-9a-f]{12}$/);
        // Image path buffers (Uint8Array put), not streamed.
        expect(lastPutStreamed(put)).toBe(false);
    });

    it('mints a ULID id, not a UUID', async () => {
        const media = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        // Crockford base32, 26 chars — matches `col.id()`'s own default generator.
        expect(media.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(media.id).not.toMatch(/-/);
        // The storage key is derived from the id, so the two must agree.
        expect(await stored(`${media.id}.jpg`)).toBe(true);
    });

    it('streams a non-image straight to storage (never buffered)', async () => {
        const put = vi.spyOn(storage, 'put');
        const media = await mediaService.upload({
            file: new File(['hello world' as BlobPart], 'notes.txt', {
                type: 'text/plain',
            }),
        });
        expect(media.width).toBeNull();
        expect(media.height).toBeNull();
        expect(media.metadata?.version).toBeUndefined();
        expect(lastPutStreamed(put)).toBe(true);
        const result = await storage.get(`${media.id}.txt`);
        if (!result) throw new Error('expected notes.txt in storage');
        expect(await new Response(result.body).text()).toBe('hello world');
    });
});

describe('mediaService.replace', () => {
    it('purges variants and overwrites when the extension is unchanged', async () => {
        const m = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        // Simulate a cached variant for this item.
        await storage.put(
            `variants/${m.id}/${m.metadata?.version}/320.webp`,
            new Uint8Array([1])
        );

        await mediaService.replace({
            id: m.id,
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });

        expect(await stored(`${m.id}.jpg`)).toBe(true);
        // Old variant purged via deletePrefix.
        expect((await storage.list(`variants/${m.id}/`)).keys).toEqual([]);
    });

    it('deletes the old original when the extension changes', async () => {
        const m = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        expect(await stored(`${m.id}.jpg`)).toBe(true);
        const deleted = vi.spyOn(storage, 'delete');

        await mediaService.replace({
            id: m.id,
            file: new File([jpegBytes() as BlobPart], 'photo.png', { type: 'image/png' }),
        });

        expect(deleted).toHaveBeenCalledWith(`${m.id}.jpg`);
        expect(await stored(`${m.id}.jpg`)).toBe(false);
        expect(await stored(`${m.id}.png`)).toBe(true);
    });

    it('keeps the old original when the row update fails', async () => {
        const m = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        const stopFailing = await failWritesTo(mediaTable, 'update');

        await expect(
            mediaService.replace({
                id: m.id,
                file: new File([jpegBytes() as BlobPart], 'photo.png', {
                    type: 'image/png',
                }),
            })
        ).rejects.toThrow('boom');
        await stopFailing();

        expect((await mediaService.get({ id: m.id }))?.filename).toBe('photo.jpg');
        expect(await stored(`${m.id}.jpg`)).toBe(true);
        expect(await stored(`${m.id}.png`)).toBe(false);
    });

    it('keeps the old bytes and metadata when a same-extension replace fails', async () => {
        const m = await mediaService.upload({
            file: new File(['old notes' as BlobPart], 'notes.txt', {
                type: 'text/plain',
            }),
        });
        const stopFailing = await failWritesTo(mediaTable, 'update');

        await expect(
            mediaService.replace({
                id: m.id,
                file: new File(['a longer replacement' as BlobPart], 'draft.txt', {
                    type: 'text/plain',
                }),
            })
        ).rejects.toThrow('boom');
        await stopFailing();

        const after = await mediaService.get({ id: m.id });
        expect(after?.filename).toBe('notes.txt');
        expect(after?.size).toBe(9);
        expect(await readStored(`${m.id}.txt`)).toBe('old notes');
        expect(await listAll(storage, '')).toEqual([`${m.id}.txt`]);
    });

    it('logs and keeps the copy of the old original when it cannot be restored', async () => {
        const m = await mediaService.upload({
            file: new File(['old notes' as BlobPart], 'notes.txt', {
                type: 'text/plain',
            }),
        });
        const stopFailing = await failWritesTo(mediaTable, 'update');
        // Storage reads the original but not the copy, so the restore fails.
        const get = storage.get.bind(storage);
        vi.spyOn(storage, 'get').mockImplementation((key, opts) =>
            key === `${m.id}.txt`
                ? get(key, opts)
                : Promise.reject(new Error('storage down'))
        );
        expectConsole(
            'error',
            new RegExp(
                `Could not restore the stored original of media ${m.id} after a failed replace; ` +
                    `the previous file is kept at \\S+: storage down`
            )
        );

        await expect(
            mediaService.replace({
                id: m.id,
                file: new File(['a longer replacement' as BlobPart], 'draft.txt', {
                    type: 'text/plain',
                }),
            })
        ).rejects.toThrow('boom');
        await stopFailing();
        vi.mocked(storage.get).mockRestore();

        const copies = (await listAll(storage, '')).filter(
            (key) => key !== `${m.id}.txt`
        );
        expect(copies).toHaveLength(1);
        expect(await readStored(copies[0] ?? '')).toBe('old notes');
    });

    it('leaves only the new original after a same-extension replace', async () => {
        const m = await mediaService.upload({
            file: new File(['old notes' as BlobPart], 'notes.txt', {
                type: 'text/plain',
            }),
        });

        await mediaService.replace({
            id: m.id,
            file: new File(['a longer replacement' as BlobPart], 'draft.txt', {
                type: 'text/plain',
            }),
        });

        expect(await readStored(`${m.id}.txt`)).toBe('a longer replacement');
        expect(await listAll(storage, '')).toEqual([`${m.id}.txt`]);
    });
});
