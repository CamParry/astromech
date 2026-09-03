/**
 * The relationship index over a translatable media item.
 *
 * The index is keyed on the item, not on one of its content rows, so every
 * locale contributes: a write to `fr` must not replace `en`'s edges with its
 * own, and a rebuild must derive exactly what the write path stored.
 */

import type { RelationshipRow } from '@/database/tables';
import type { AstromechConfig, StorageDriver } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { entriesService } from '@/entries/service';
import { createMediaRepository } from '@/media/repository';
import { mediaService } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';
import { rebuildRelationshipIndex } from '@/transport/cli/relationship-index';

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

/** Two locales, and one per-locale relationship field on media. */
function makeConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        media: {
            translatable: true,
            fields: [
                { name: 'credit', type: 'relationship', label: 'Credit', target: 'post' },
            ],
        },
    };
}

let id: string;
let postA: string;
let postB: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeConfig());
    setStorageDriver(noopStorage);
    postA = (await entriesService.create({ type: 'post', data: { title: 'A' } })).id;
    postB = (await entriesService.create({ type: 'post', data: { title: 'B' } })).id;
    const row = await createMediaRepository().create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        {}
    );
    id = row.id;
});

/** The media item's index rows, ordered by target so two runs compare directly. */
async function credits(): Promise<string[]> {
    const rows = await createRelationshipRepository().findBySource(id, 'media');
    return rows.map((row) => row.targetId).sort();
}

/** Every stored row, in a stable order, so the rebuild compares to the write path. */
async function storedRows(): Promise<RelationshipRow[]> {
    const rows = await createRelationshipRepository().findAll();
    return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe('media relationships across locales', () => {
    it('indexes every locale of one item', async () => {
        await mediaService.update({ id, data: { fields: { credit: postA } } });
        await mediaService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });

        expect(await credits()).toEqual([postA, postB].sort());
    });

    it('keeps the other locale’s edge when one locale drops its reference', async () => {
        await mediaService.update({ id, data: { fields: { credit: postA } } });
        await mediaService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });

        await mediaService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: null } },
        });

        expect(await credits()).toEqual([postA]);
    });

    it('rebuilds to exactly the rows the write path stored', async () => {
        await mediaService.update({ id, data: { fields: { credit: postA } } });
        await mediaService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });
        const written = await storedRows();

        await rebuildRelationshipIndex();

        expect(await storedRows()).toEqual(written);
    });
});
