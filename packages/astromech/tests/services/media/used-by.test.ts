/**
 * `mediaApi.usedBy` — reverse lookup for the media "used by" panel.
 *
 * Media only became a real relationship TARGET in this workstream: the old
 * subsystem recorded a media field as an entry edge and dropped it, so no row
 * pointing at a media item was ever written and this panel could not exist.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { entries } from '@/entries/service.js';
import { mediaApi } from '@/media/service.js';
import { createMediaStorage } from '@/media/storage.js';
import { usersApi } from '@/users/service.js';
import type { AstromechConfig, StorageDriver } from '@/types/index.js';

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

/**
 * `article` holds a media field flat and another inside a repeater; users hold
 * one too, so a `sourceType: null` source is reachable.
 */
function makeUsageConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            article: {
                single: 'Article',
                plural: 'Articles',
                staging: true,
                fields: [
                    { name: 'cover', type: 'media', label: 'Cover' },
                    {
                        name: 'sections',
                        type: 'repeater',
                        label: 'Sections',
                        fields: [{ name: 'image', type: 'media', label: 'Image' }],
                    },
                ],
            },
        },
        users: {
            fields: [{ name: 'avatar', type: 'media', label: 'Avatar' }],
        },
    };
}

/** A media row, inserted through storage so no driver or real bytes are needed. */
async function createMedia(filename = 'a.png'): Promise<string> {
    const row = await createMediaStorage().create({
        filename,
        mimeType: 'image/png',
        size: 1,
    });
    return row.id;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeUsageConfig());
    setStorageDriver(noopStorage);
});

describe('mediaApi.usedBy', () => {
    it('returns an entry that references the file from a plain media field', async () => {
        const mediaId = await createMedia();
        const article = await entries.create({
            type: 'article',
            title: 'Article',
            fields: { cover: mediaId },
        });

        expect(await mediaApi.usedBy({ id: mediaId })).toEqual([
            {
                sourceId: article.id,
                sourceKind: 'entry',
                sourceType: 'article',
                schemaPath: 'cover',
                instancePath: 'cover',
                sourceStaged: false,
            },
        ]);
    });

    it('records a nested schema path and a distinct instance path inside a repeater', async () => {
        const mediaId = await createMedia();
        await entries.create({
            type: 'article',
            title: 'Nested',
            fields: { sections: [{ image: mediaId }] },
        });

        const usage = await mediaApi.usedBy({ id: mediaId });

        expect(usage).toHaveLength(1);
        expect(usage[0]?.schemaPath).toBe('sections[].image');
        // The instance path addresses the repeater item by its persisted `_id`.
        expect(usage[0]?.instancePath).toMatch(/^sections\[.+\]\.image$/);
        expect(usage[0]?.instancePath).not.toBe(usage[0]?.schemaPath);
    });

    it('yields one row per path when a source uses the file twice', async () => {
        const mediaId = await createMedia();
        const article = await entries.create({
            type: 'article',
            title: 'Twice',
            fields: { cover: mediaId, sections: [{ image: mediaId }] },
        });

        const usage = await mediaApi.usedBy({ id: mediaId });

        expect(usage).toHaveLength(2);
        expect(usage.every((row) => row.sourceId === article.id)).toBe(true);
        expect(usage.map((row) => row.schemaPath)).toEqual(['cover', 'sections[].image']);
    });

    // A pending merge that uses the file is a reason not to delete it.
    it('includes a staged source and flags it', async () => {
        const mediaId = await createMedia();
        const canonical = await entries.create({
            type: 'article',
            title: 'Canonical',
            fields: { cover: mediaId },
        });
        const staged = await entries.createStaged({
            type: 'article',
            id: canonical.id,
        });

        const usage = await mediaApi.usedBy({ id: mediaId });

        expect(usage.map((row) => row.sourceId).sort()).toEqual(
            [canonical.id, staged.id].sort()
        );
        expect(usage.find((row) => row.sourceId === staged.id)?.sourceStaged).toBe(true);
        expect(usage.find((row) => row.sourceId === canonical.id)?.sourceStaged).toBe(
            false
        );
    });

    it('returns a user source with a null sourceType', async () => {
        const mediaId = await createMedia();
        const user = await usersApi.create({
            email: 'avatar@test.dev',
            name: 'Avatar Owner',
            fields: { avatar: mediaId },
        });

        expect(await mediaApi.usedBy({ id: mediaId })).toEqual([
            {
                sourceId: user.id,
                sourceKind: 'user',
                sourceType: null,
                schemaPath: 'avatar',
                instancePath: 'avatar',
                sourceStaged: false,
            },
        ]);
    });

    it('returns an empty list for an unused file', async () => {
        expect(await mediaApi.usedBy({ id: await createMedia() })).toEqual([]);
    });

    // Matches `entries.incomingRelations`, which asserts the target exists
    // rather than reporting "no usage" for an id that is not a media item.
    it('throws for an unknown media id', async () => {
        await expect(mediaApi.usedBy({ id: 'nope' })).rejects.toThrow(/not found/);
    });
});
