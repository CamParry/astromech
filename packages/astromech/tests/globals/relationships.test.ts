/**
 * The relationship index over a global: every write indexes it as a `global`
 * source under its key, a staged change's own references are staged, a dead
 * id is dropped on the next write, and a rebuild derives what the writes stored.
 */

import type { RelationshipRow } from '@/database/tables';
import type { AstromechConfig } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getRelationshipRepository } from '@/content/repository/relationships';
import { assertRequiredCapability } from '@/globals/internal/global';
import { getMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { rebuildRelationshipIndex } from '@/transport/cli/relationship-index';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;
const mediaService = currentServices.media;

/** A staged global holding a media field and a relationship field. */
function makeConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        globals: [
            {
                key: 'site',
                label: 'Site',
                staging: true,
                fields: [
                    { name: 'logo', type: 'media', label: 'Logo' },
                    { name: 'home', type: 'relationship', label: 'Home', target: 'post' },
                ],
            },
        ],
    };
}

let mediaId: string;
let postId: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeConfig());
    setStorageDriver(noopStorage);
    mediaId = (
        await getMediaRepository().create(
            { filename: 'logo.png', mimeType: 'image/png', size: 1 },
            {}
        )
    ).id;
    postId = (await entriesService.create({ type: 'post', data: { title: 'Home' } })).id;
});

/** Every stored row, in a stable order, so the rebuild compares to the write path. */
async function storedRows(): Promise<RelationshipRow[]> {
    const rows = await getRelationshipRepository().findMany();
    return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe('global relationships', () => {
    it('indexes a global as a source under its key', async () => {
        const saved = await globalsService.update({
            key: 'site',
            data: { fields: { logo: mediaId, home: postId } },
        });

        const rows = await getRelationshipRepository().findBySource(saved.id, 'global');
        expect(
            rows.map((row) => [row.sourceType, row.schemaPath, row.targetId]).sort()
        ).toEqual([
            ['site', 'home', postId],
            ['site', 'logo', mediaId],
        ]);
    });

    it('is reported by media.usedBy', async () => {
        const saved = await globalsService.update({
            key: 'site',
            data: { fields: { logo: mediaId } },
        });

        const usage = await mediaService.usedBy({ id: mediaId });
        expect(
            usage.map((row) => [row.sourceKind, row.sourceId, row.sourceType])
        ).toEqual([['global', saved.id, 'site']]);
    });

    it('marks a reference only the staged change holds as staged', async () => {
        await globalsService.update({ key: 'site', data: { fields: { home: postId } } });
        await globalsService.createStaged({
            key: 'site',
            data: { fields: { logo: mediaId } },
        });

        const rows = await getRelationshipRepository().findByTarget(mediaId, 'media', {
            includeStaged: true,
        });
        expect(rows.map((row) => row.sourceStaged)).toEqual([true]);

        await globalsService.deleteStaged({ key: 'site' });
        expect(
            await getRelationshipRepository().findByTarget(mediaId, 'media', {
                includeStaged: true,
            })
        ).toEqual([]);
    });

    it('drops a deleted target on the next write', async () => {
        await globalsService.update({
            key: 'site',
            data: { fields: { logo: mediaId, home: postId } },
        });
        await entriesService.delete({ type: 'post', id: postId });

        const saved = await globalsService.update({
            key: 'site',
            data: { fields: { logo: mediaId } },
        });
        expect(saved.fields).toEqual({ logo: mediaId, home: null });
    });

    // The key shares `sourceType` with entry types, so an entry-type-scoped
    // rebuild must not read a global's rows as its own orphans.
    it('stays out of an entry-type-scoped read of the index', async () => {
        await globalsService.update({ key: 'site', data: { fields: { logo: mediaId } } });

        expect(await getRelationshipRepository().findMany({ entryType: 'site' })).toEqual(
            []
        );
    });

    it('rebuilds exactly what the writes stored', async () => {
        await globalsService.update({
            key: 'site',
            data: { fields: { logo: mediaId, home: postId } },
        });
        const written = await storedRows();

        await getRelationshipRepository().deleteMany();
        await rebuildRelationshipIndex();

        expect(await storedRows()).toEqual(written);
    });

    // A global has one row per locale, so a `unique` field has nothing to collide with.
    it('accepts any value for a unique field', async () => {
        setupTestConfig({
            ...makeConfig(),
            globals: [
                {
                    key: 'site',
                    label: 'Site',
                    fields: [
                        {
                            name: 'code',
                            type: 'text',
                            label: 'Code',
                            validation: [{ unique: true }],
                        },
                    ],
                },
            ],
        });
        const saved = await globalsService.update({
            key: 'site',
            data: { fields: { code: 'A' } },
        });
        expect(saved.fields).toEqual({ code: 'A' });
    });

    it('refuses a capability name that is not a global one', () => {
        expect(() =>
            assertRequiredCapability(
                setupTestConfig(makeConfig()),
                { key: 'site' },
                'trash'
            )
        ).toThrow(/not a global capability/);
    });
});
