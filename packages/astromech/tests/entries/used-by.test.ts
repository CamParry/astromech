/**
 * `entries.usedBy` — reverse lookup for the delete modal. The interesting case
 * is a source whose entry type is not the target's, named through its own type.
 */

import type { AstromechConfig } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { mediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';

const api = currentServices.entries;
const globalsService = currentServices.globals;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** `article` references `post` twice — once flat, once inside a repeater. */
function makeRelationsConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            article: {
                single: 'Article',
                plural: 'Articles',
                staging: true,
                translatable: true,
                fields: [
                    {
                        name: 'author',
                        type: 'relationship',
                        label: 'Author',
                        target: 'post',
                    },
                    {
                        name: 'sections',
                        type: 'repeater',
                        label: 'Sections',
                        fields: [
                            {
                                name: 'related',
                                type: 'relationship',
                                label: 'Related',
                                target: 'post',
                            },
                        ],
                    },
                ],
            },
        },
        users: {
            fields: [
                {
                    name: 'featured',
                    type: 'relationship',
                    label: 'Featured',
                    target: 'post',
                },
            ],
        },
        media: {
            fields: [
                { name: 'about', type: 'relationship', label: 'About', target: 'post' },
            ],
        },
        globals: [
            {
                key: 'site',
                label: 'Site',
                fields: [
                    { name: 'home', type: 'relationship', label: 'Home', target: 'post' },
                ],
            },
        ],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeRelationsConfig());
});

describe('usedBy', () => {
    it('returns a source whose entry type is not the target type', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const source = await api.create({
            type: 'article',
            data: { title: 'Article', fields: { author: target.id } },
        });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        expect(incoming).toEqual([
            {
                sourceId: source.id,
                sourceKind: 'entry',
                sourceTitle: 'Article',
                sourceType: 'article',
                schemaPath: 'author',
                instancePath: 'author',
                sourceStaged: false,
            },
        ]);
    });

    it('yields one row per schema path when a source references the target twice', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const source = await api.create({
            type: 'article',
            data: {
                title: 'Twice',
                fields: { author: target.id, sections: [{ related: target.id }] },
            },
        });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        expect(incoming).toHaveLength(2);
        expect(incoming.every((r) => r.sourceId === source.id)).toBe(true);
        expect(incoming.map((r) => r.schemaPath).sort()).toEqual([
            'author',
            'sections[].related',
        ]);
    });

    // A pending merge referencing the target is a reason not to delete it.
    it('counts a staged source once, under the entry id', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const canonical = await api.create({
            type: 'article',
            data: { title: 'Canonical', fields: { author: target.id } },
        });
        await api.createStaged({ type: 'article', id: canonical.id });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        // The staged row is the same entry, holding the same reference.
        expect(incoming.map((r) => r.sourceId)).toEqual([canonical.id]);
    });

    it('counts a source referencing the target from two locales once', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const source = await api.create({
            type: 'article',
            data: { title: 'EN', fields: { author: target.id } },
        });
        await api.update({
            type: 'article',
            id: source.id,
            locale: 'de',
            data: { title: 'DE', fields: { author: target.id } },
        });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        expect(incoming.map((r) => r.sourceId)).toEqual([source.id]);
        // Named in the default locale, whichever locale was written last.
        expect(incoming.map((r) => r.sourceTitle)).toEqual(['EN']);
    });

    it('includes a trashed source', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const source = await api.create({
            type: 'article',
            data: { title: 'Trashed', fields: { author: target.id } },
        });
        await api.trash({ type: 'article', id: source.id });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        expect(incoming.map((r) => r.sourceId)).toEqual([source.id]);
    });

    it('reports a global, a user and a media item holding a reference', async () => {
        setStorageDriver(noopStorage);
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const global = await globalsService.update({
            key: 'site',
            data: { fields: { home: target.id } },
        });
        const user = await usersService.create({
            data: {
                email: 'a@example.com',
                name: 'Ada',
                fields: { featured: target.id },
            },
        });
        const media = await mediaRepository.create(
            { filename: 'photo.png', mimeType: 'image/png', size: 1 },
            {}
        );
        await mediaService.update({
            id: media.id,
            data: { fields: { about: target.id } },
        });

        const usage = await api.usedBy({ type: 'post', id: target.id });

        expect(
            usage.map((row) => [row.sourceKind, row.sourceId, row.sourceTitle])
        ).toEqual([
            ['global', global.id, 'Site'],
            ['media', media.id, 'photo.png'],
            ['user', user.id, 'Ada'],
        ]);
    });

    it('returns an empty list when nothing references the target', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Lonely' } });
        expect(await api.usedBy({ type: 'post', id: target.id })).toEqual([]);
    });
});
