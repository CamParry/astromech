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
import { mediaRepository } from '@/media/repository';
import { handleMediaRequest } from '@/media/serving/handler';
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

/** The bytes the media route serves for item `id`'s original. */
async function readThroughRoute(id: string): Promise<string> {
    const res = await handleMediaRequest({
        id,
        ext: '',
        search: new URLSearchParams(),
        origin: 'http://x',
    });
    if (res.status !== 200)
        throw new Error(`expected a 200 for ${id}, got ${res.status}`);
    return res.text();
}

/** A plain-text file named `name` holding `text`. */
function textFile(name: string, text: string): File {
    return new File([text as BlobPart], name, { type: 'text/plain' });
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

    it('refuses fields that fail validation, storing no file and no item', async () => {
        setupTestConfig({
            ...makeTestConfig(),
            storage,
            media: {
                fields: [
                    { name: 'credit', type: 'text', label: 'Credit', required: true },
                ],
            },
        });

        await expect(
            mediaService.upload({ file: textFile('notes.txt', 'hello'), fields: {} })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { credit: ['This field is required'] },
        });

        expect(await listAll(storage, '')).toEqual([]);
        expect((await mediaService.query({})).data).toEqual([]);
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

    it('puts the old bytes back when writing the new file fails partway', async () => {
        const m = await mediaService.upload({ file: textFile('notes.txt', 'old notes') });
        const put = storage.put.bind(storage);
        let failed = false;
        // The first write to the original stores a few bytes, then the disk fills.
        vi.spyOn(storage, 'put').mockImplementation(async (key, body, opts) => {
            if (key !== `${m.id}.txt` || failed) return put(key, body, opts);
            failed = true;
            await put(key, new TextEncoder().encode('a lo'), opts);
            throw new Error('disk full');
        });

        await expect(
            mediaService.replace({
                id: m.id,
                file: textFile('draft.txt', 'a longer one'),
            })
        ).rejects.toThrow('disk full');

        expect((await mediaService.get({ id: m.id }))?.filename).toBe('notes.txt');
        expect(await readStored(`${m.id}.txt`)).toBe('old notes');
        expect(await listAll(storage, '')).toEqual([`${m.id}.txt`]);
    });

    it('purges a variant built from the new bytes before a failed replace is undone', async () => {
        const m = await mediaService.upload({
            file: new File([jpegBytes() as BlobPart], 'photo.jpg', {
                type: 'image/jpeg',
            }),
        });
        const staleVariant = `variants/${m.id}/${m.metadata?.version}/320.webp`;
        const put = storage.put.bind(storage);
        let windowOpen = true;
        // A request between the write and the failed update caches a variant of
        // the new bytes under the old version.
        vi.spyOn(storage, 'put').mockImplementation(async (key, body, opts) => {
            await put(key, body, opts);
            if (key !== `${m.id}.jpg` || !windowOpen) return;
            windowOpen = false;
            await put(staleVariant, new Uint8Array([1]));
        });
        const stopFailing = await failWritesTo(mediaTable, 'update');

        await expect(
            mediaService.replace({
                id: m.id,
                file: new File([jpegBytes() as BlobPart], 'other.jpg', {
                    type: 'image/jpeg',
                }),
            })
        ).rejects.toThrow('boom');
        await stopFailing();

        expect(windowOpen).toBe(false);
        expect(await listAll(storage, `variants/${m.id}/`)).toEqual([]);
    });

    // Replace A fails after replace B has committed; restoring A's copy would
    // put the first file under B's row.
    it("leaves another replace's file when a concurrent replace fails", async () => {
        const m = await mediaService.upload({ file: textFile('notes.txt', 'first') });
        const updateFile = mediaRepository.updateFile;
        let interleaved = false;
        vi.spyOn(mediaRepository, 'updateFile').mockImplementation(async (id, patch) => {
            if (interleaved) return updateFile(id, patch);
            interleaved = true;
            await mediaService.replace({
                id,
                file: textFile('second.txt', 'second file'),
            });
            throw new Error('boom');
        });
        expectConsole(
            'error',
            `Did not restore the stored original of media ${m.id} after a failed replace: ` +
                'another write changed or deleted it first'
        );

        await expect(
            mediaService.replace({ id: m.id, file: textFile('third.txt', 'third') })
        ).rejects.toThrow('boom');

        expect((await mediaService.get({ id: m.id }))?.filename).toBe('second.txt');
        expect(await readStored(`${m.id}.txt`)).toBe('second file');
        expect(await listAll(storage, '')).toEqual([`${m.id}.txt`]);
    });

    // `a.JPG` and `b.jpg` are one file on a case-insensitive disk.
    it.each([
        ['a.JPG', 'b.jpg'],
        ['a.jpg', 'b.JPG'],
    ])('serves the new file after replacing %s with %s', async (from, to) => {
        const m = await mediaService.upload({ file: textFile(from, 'old bytes') });

        await mediaService.replace({ id: m.id, file: textFile(to, 'new bytes') });

        expect(await readThroughRoute(m.id)).toBe('new bytes');
        expect(await listAll(storage, '')).toEqual([`${m.id}.jpg`]);
    });

    it.each([
        ['a.JPG', 'b.jpg'],
        ['a.jpg', 'b.JPG'],
    ])('serves the old file after replacing %s with %s fails', async (from, to) => {
        const m = await mediaService.upload({ file: textFile(from, 'old bytes') });
        const stopFailing = await failWritesTo(mediaTable, 'update');

        await expect(
            mediaService.replace({ id: m.id, file: textFile(to, 'new bytes') })
        ).rejects.toThrow('boom');
        await stopFailing();

        expect(await readThroughRoute(m.id)).toBe('old bytes');
        expect(await listAll(storage, '')).toEqual([`${m.id}.jpg`]);
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
