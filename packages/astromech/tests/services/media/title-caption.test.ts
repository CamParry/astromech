/**
 * `title` and `caption` round-trip through `mediaService.update`.
 *
 * The modal shipped a Title input for a column that did not exist: the field
 * validated, the service dropped it, and the value vanished with no error. The
 * point of these is that a write is READ BACK, not merely accepted.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { mediaService } from '@/media/service.js';
import { createMediaStorage } from '@/media/storage.js';
import type { StorageDriver } from '@/types/index.js';

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);

    const row = await createMediaStorage().create({
        filename: 'a.png',
        mimeType: 'image/png',
        size: 1,
    });
    id = row.id;
});

describe('mediaService.update — title and caption', () => {
    it('defaults both to null on a fresh record', async () => {
        const found = await mediaService.get({ id });
        expect(found?.title ?? null).toBeNull();
        expect(found?.caption ?? null).toBeNull();
    });

    it('persists a title and reads it back', async () => {
        await mediaService.update({ id, data: { title: 'A blue square' } });
        expect((await mediaService.get({ id }))?.title).toBe('A blue square');
    });

    it('persists a caption and reads it back', async () => {
        await mediaService.update({ id, data: { caption: 'Shot on a Tuesday' } });
        expect((await mediaService.get({ id }))?.caption).toBe('Shot on a Tuesday');
    });

    it('persists alt, title and caption together', async () => {
        await mediaService.update({
            id,
            data: { alt: 'alt text', title: 'the title', caption: 'the caption' },
        });
        const found = await mediaService.get({ id });
        expect(found?.alt).toBe('alt text');
        expect(found?.title).toBe('the title');
        expect(found?.caption).toBe('the caption');
    });

    it('leaves an omitted column alone rather than nulling it', async () => {
        await mediaService.update({ id, data: { title: 'kept', caption: 'also kept' } });
        await mediaService.update({ id, data: { alt: 'only alt changed' } });
        const found = await mediaService.get({ id });
        expect(found?.title).toBe('kept');
        expect(found?.caption).toBe('also kept');
        expect(found?.alt).toBe('only alt changed');
    });

    it('returns the new values from update itself, not just from a re-read', async () => {
        const returned = await mediaService.update({
            id,
            data: { title: 'immediate', caption: 'immediate caption' },
        });
        expect(returned.title).toBe('immediate');
        expect(returned.caption).toBe('immediate caption');
    });
});
