/**
 * `title` and `caption` round-trip through `mediaService.update`. A write is READ
 * BACK, not merely accepted, because a field that validates but has no column
 * would otherwise vanish with no error.
 */

import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { mediaService } from '@/app-context/services';
import { createMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    setStorageDriver(noopStorage);

    const row = await createMediaRepository().create(
        {
            filename: 'a.png',
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
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
