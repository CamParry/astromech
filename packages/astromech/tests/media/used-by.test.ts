/**
 * `mediaService.usedBy`, the reverse lookup for the media "used by" panel. A
 * media field records a relationship row targeting media, which the panel reads.
 */

import type { AstromechConfig } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { createMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';

const entriesService = currentServices.entries;
const mediaService = currentServices.media;
const usersService = currentServices.users;

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

/** A media row, inserted through the repository so no driver or real bytes are needed. */
async function createMedia(filename = 'a.png'): Promise<string> {
    const row = await createMediaRepository().create(
        {
            filename,
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    return row.id;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeUsageConfig());
    setStorageDriver(noopStorage);
});

describe('mediaService.usedBy', () => {
    it('returns an entry that references the file from a plain media field', async () => {
        const mediaId = await createMedia();
        const article = await entriesService.create({
            type: 'article',
            data: { title: 'Article', fields: { cover: mediaId } },
        });

        expect(await mediaService.usedBy({ id: mediaId })).toEqual([
            {
                sourceId: article.id,
                sourceKind: 'entry',
                sourceType: 'article',
                sourceTitle: 'Article',
                schemaPath: 'cover',
                instancePath: 'cover',
                sourceStaged: false,
            },
        ]);
    });

    it('records a nested schema path and a distinct instance path inside a repeater', async () => {
        const mediaId = await createMedia();
        await entriesService.create({
            type: 'article',
            data: { title: 'Nested', fields: { sections: [{ image: mediaId }] } },
        });

        const usage = await mediaService.usedBy({ id: mediaId });

        expect(usage).toHaveLength(1);
        expect(usage[0]?.schemaPath).toBe('sections[].image');
        // The instance path addresses the repeater item by its persisted `_id`.
        expect(usage[0]?.instancePath).toMatch(/^sections\[.+\]\.image$/);
        expect(usage[0]?.instancePath).not.toBe(usage[0]?.schemaPath);
    });

    it('yields one row per path when a source uses the file twice', async () => {
        const mediaId = await createMedia();
        const article = await entriesService.create({
            type: 'article',
            data: {
                title: 'Twice',
                fields: { cover: mediaId, sections: [{ image: mediaId }] },
            },
        });

        const usage = await mediaService.usedBy({ id: mediaId });

        expect(usage).toHaveLength(2);
        expect(usage.every((row) => row.sourceId === article.id)).toBe(true);
        expect(usage.map((row) => row.schemaPath)).toEqual(['cover', 'sections[].image']);
    });

    // A pending merge that uses the file is a reason not to delete it, and it
    // is the same entry as the canonical, so it is one row rather than two.
    it('keeps a file a staged change alone references', async () => {
        const mediaId = await createMedia();
        const canonical = await entriesService.create({
            type: 'article',
            data: { title: 'Canonical' },
        });
        await entriesService.createStaged({ type: 'article', id: canonical.id });
        await entriesService.update({
            type: 'article',
            id: canonical.id,
            staged: true,
            data: { fields: { cover: mediaId } },
        });

        const usage = await mediaService.usedBy({ id: mediaId });

        expect(usage.map((row) => row.sourceId)).toEqual([canonical.id]);
        expect(usage[0]?.sourceTitle).toBe('Canonical');
        // Only the staged row holds this reference, so it is staged — the flag
        // is per reference, not per entry.
        expect(usage[0]?.sourceStaged).toBe(true);
    });

    it('returns a user source with a null sourceType', async () => {
        const mediaId = await createMedia();
        const user = await usersService.create({
            data: {
                email: 'avatar@test.dev',
                name: 'Avatar Owner',
                fields: { avatar: mediaId },
            },
        });

        expect(await mediaService.usedBy({ id: mediaId })).toEqual([
            {
                sourceId: user.id,
                sourceKind: 'user',
                sourceType: null,
                sourceTitle: 'Avatar Owner',
                schemaPath: 'avatar',
                instancePath: 'avatar',
                sourceStaged: false,
            },
        ]);
    });

    // Titles for user and media sources load in one read per kind, not one per
    // source, so several of each must still come back named and in order.
    it('names several user and media sources, and leaves a missing one untitled', async () => {
        const mediaId = await createMedia('target.png');
        const users = await Promise.all(
            ['Ada', 'Grace', 'Linus'].map((name) =>
                usersService.create({
                    data: {
                        email: `${name.toLowerCase()}@test.dev`,
                        name,
                        fields: { avatar: mediaId },
                    },
                })
            )
        );
        // No media field type sits on media itself, so the index rows for media
        // sources are written directly. The last source id has no row at all.
        const mediaSources = [
            await createMedia('first.png'),
            await createMedia('second.png'),
            'missing-media',
        ];
        const relationships = createRelationshipRepository();
        for (const sourceId of mediaSources) {
            await relationships.replaceForSource({ id: sourceId, kind: 'media' }, [
                {
                    schemaPath: 'credit',
                    instancePath: 'credit',
                    targetId: mediaId,
                    targetKind: 'media',
                },
            ]);
        }

        const usage = await mediaService.usedBy({ id: mediaId });

        const titleOf = (sourceId: string) =>
            usage.find((row) => row.sourceId === sourceId)?.sourceTitle;
        expect(usage).toHaveLength(6);
        expect(users.map((user) => titleOf(user.id))).toEqual(['Ada', 'Grace', 'Linus']);
        expect(mediaSources.map(titleOf)).toEqual(['first.png', 'second.png', '']);
        expect(usage.map((row) => row.sourceKind)).toEqual([
            'media',
            'media',
            'media',
            'user',
            'user',
            'user',
        ]);
    });

    it('returns an empty list for an unused file', async () => {
        expect(await mediaService.usedBy({ id: await createMedia() })).toEqual([]);
    });

    // Matches `entries.usedBy`, which asserts the target exists
    // rather than reporting "no usage" for an id that is not a media item.
    it('throws for an unknown media id', async () => {
        await expect(mediaService.usedBy({ id: 'nope' })).rejects.toThrow(/not found/);
    });
});
