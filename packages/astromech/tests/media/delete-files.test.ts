import type { StorageDriver } from '@/types/index';
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

const mediaService = currentServices.media;

// Minimal 1x1 JPEG (SOI + APP0 + SOF0 + EOI), so the upload records a version.
function jpegBytes(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
        0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
}

let storage: StorageDriver;

beforeEach(async () => {
    await createTestDb();
    storage = createTestStorage();
    setupTestConfig({ ...makeTestConfig(), storage });
});

/** Upload a JPEG and store the variants the image route would have cached for it. */
async function uploadImageWithVariants(): Promise<{ id: string; keys: string[] }> {
    const media = await mediaService.upload({
        file: new File([jpegBytes() as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
    });
    const version = media.metadata?.version;
    if (!version) throw new Error('expected the image upload to record a version');
    const variants = [
        `variants/${media.id}/${version}/320.webp`,
        `variants/${media.id}/${version}/640.webp`,
        `variants/${media.id}/${version}/320.avif`,
        // A variant of an earlier version of the file, left behind by a replace.
        `variants/${media.id}/0123456789ab/320.webp`,
    ];
    for (const key of variants) await storage.put(key, new Uint8Array([1]));
    return { id: media.id, keys: [`${media.id}.jpg`, ...variants] };
}

async function uploadText(): Promise<{ id: string; keys: string[] }> {
    const media = await mediaService.upload({
        file: new File(['hello world' as BlobPart], 'notes.txt', { type: 'text/plain' }),
    });
    return { id: media.id, keys: [`${media.id}.txt`] };
}

/** The keys of `keys` that storage still holds. */
async function storedOf(keys: string[]): Promise<string[]> {
    const held: string[] = [];
    for (const key of keys) if ((await storage.stat(key)) !== null) held.push(key);
    return held;
}

describe('mediaService.delete', () => {
    it("removes an image's original and every variant from storage", async () => {
        const image = await uploadImageWithVariants();
        expect(await storedOf(image.keys)).toEqual(image.keys);

        await mediaService.delete({ id: image.id });

        expect(await storedOf(image.keys)).toEqual([]);
        expect((await storage.list(`variants/${image.id}/`)).keys).toEqual([]);
        expect(await mediaService.get({ id: image.id })).toBeNull();
    });

    it("removes a non-image's file from storage", async () => {
        const text = await uploadText();
        expect(await storedOf(text.keys)).toEqual(text.keys);

        await mediaService.delete({ id: text.id });

        expect(await storedOf(text.keys)).toEqual([]);
        expect(await mediaService.get({ id: text.id })).toBeNull();
    });

    // The admin's bulk delete calls `delete` once per id.
    it('removes the files of each item in a batch and leaves the others', async () => {
        const first = await uploadImageWithVariants();
        const second = await uploadImageWithVariants();
        const text = await uploadText();
        const kept = await uploadImageWithVariants();

        for (const id of [first.id, second.id, text.id])
            await mediaService.delete({ id });

        expect(await storedOf([...first.keys, ...second.keys, ...text.keys])).toEqual([]);
        expect(await storedOf(kept.keys)).toEqual(kept.keys);
        expect(await mediaService.get({ id: kept.id })).not.toBeNull();
    });

    it('keeps the item when storage fails to delete its file', async () => {
        const image = await uploadImageWithVariants();
        vi.spyOn(storage, 'delete').mockRejectedValueOnce(new Error('storage down'));

        await expect(mediaService.delete({ id: image.id })).rejects.toThrow(
            'storage down'
        );

        expect((await mediaService.get({ id: image.id }))?.id).toBe(image.id);
    });

    // Defect: `delete` removes the files before the row's transaction runs, so
    // when the row delete fails the item survives with its original gone, and
    // every read of it serves a missing file. Deleting the files after the row
    // commits would leave at worst an orphaned file instead.
    it.fails('keeps the stored files when the row delete fails', async () => {
        const image = await uploadImageWithVariants();
        const stopFailing = await failWritesTo(mediaTable, 'delete');

        await expect(mediaService.delete({ id: image.id })).rejects.toThrow('boom');
        await stopFailing();

        expect((await mediaService.get({ id: image.id }))?.id).toBe(image.id);
        expect(await storedOf(image.keys)).toEqual(image.keys);
    });
});
