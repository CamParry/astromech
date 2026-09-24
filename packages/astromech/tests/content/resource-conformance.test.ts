/**
 * Every resource answers the shared behaviour the same way: a missing one is a
 * 404, a locale it cannot hold is refused, a version round-trips, its references
 * reach `usedBy`, and an unknown sort answers 400. How each resource is called
 * differs, and that difference is the adapter table below.
 */

import type { JsonObject, ResourceType } from '@/types/index';
import { noopStorage } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { RESOURCE_SPECS } from '@/content/resources';
import { getMediaRepository } from '@/media/repository';
import { setStorageDriver } from '@/storage/registry';
import { RESOURCE_TYPES } from '@/types/domain';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** How the conformance checks reach one resource. `id` is a global's key. */
type Adapter = {
    /** Save one resource holding `fields`; answers its address. */
    save(fields: JsonObject): Promise<string>;
    /** Write `fields` to one locale of it. */
    update(id: string, fields: JsonObject, locale?: string): Promise<unknown>;
    versions(id: string): Promise<{ id: string }[]>;
    restore(id: string, versionId: string): Promise<{ fields: JsonObject }>;
    /** A read of one that does not exist, where the method must throw. */
    missing(): Promise<unknown>;
    /** A list sorted by `sort`; absent for a resource with no list. */
    list?: (sort: Record<string, 'asc' | 'desc'>) => Promise<unknown>;
};

/** Each resource declares a `title` text field and a `logo` media field. */
const FIELDS = [
    { name: 'title', type: 'text', label: 'Title' },
    { name: 'logo', type: 'media', label: 'Logo' },
] as const;

/** Makes each saved user's email unique. */
let users = 0;

const ADAPTERS: Record<ResourceType, Adapter> = {
    entry: {
        async save(fields) {
            return (
                await entriesService.create({
                    type: 'page',
                    data: { title: 'P', fields },
                })
            ).id;
        },
        update: (id, fields, locale) =>
            entriesService.update({
                type: 'page',
                id,
                ...(locale ? { locale } : {}),
                data: { fields },
            }),
        versions: (id) => entriesService.versions({ type: 'page', id }),
        restore: (id, versionId) =>
            entriesService.restoreVersion({ type: 'page', id, versionId }),
        missing: () => entriesService.versions({ type: 'page', id: 'nope' }),
        list: (sort) => entriesService.query({ type: 'page', sort, full: true }),
    },
    global: {
        async save(fields) {
            await globalsService.update({ key: 'site', data: { fields } });
            return 'site';
        },
        update: (key, fields, locale) =>
            globalsService.update({
                key,
                ...(locale ? { locale } : {}),
                data: { fields },
            }),
        versions: (key) => globalsService.versions({ key }),
        restore: (key, versionId) => globalsService.restoreVersion({ key, versionId }),
        missing: () => globalsService.versions({ key: 'nope' }),
    },
    user: {
        async save(fields) {
            const user = await usersService.create({
                data: {
                    email: `user${String((users += 1))}@test.dev`,
                    name: 'U',
                    fields,
                },
            });
            return user.id;
        },
        update: (id, fields, locale) =>
            usersService.update({ id, ...(locale ? { locale } : {}), data: { fields } }),
        versions: (id) => usersService.versions({ id }),
        restore: (id, versionId) => usersService.restoreVersion({ id, versionId }),
        missing: () => usersService.versions({ id: 'nope' }),
        list: (sort) => usersService.query({ sort }),
    },
    media: {
        async save(fields) {
            const row = await getMediaRepository().create(
                { filename: 'file.png', mimeType: 'image/png', size: 1 },
                {}
            );
            await mediaService.update({ id: row.id, data: { fields } });
            return row.id;
        },
        update: (id, fields, locale) =>
            mediaService.update({ id, ...(locale ? { locale } : {}), data: { fields } }),
        versions: (id) => mediaService.versions({ id }),
        restore: (id, versionId) => mediaService.restoreVersion({ id, versionId }),
        missing: () => mediaService.versions({ id: 'nope' }),
        list: (sort) => mediaService.query({ sort }),
    },
};

beforeEach(async () => {
    await createTestDb();
    const base = makeTestConfig();
    setupTestConfig({
        ...base,
        entries: {
            ...base.entries,
            // Not translatable, so `de` is a locale it cannot hold.
            page: {
                single: 'Page',
                plural: 'Pages',
                versioning: true,
                fields: [...FIELDS],
            },
        },
        globals: [{ key: 'site', label: 'Site', fields: [...FIELDS] }],
        users: { fields: [...FIELDS] },
        media: { fields: [...FIELDS] },
    });
    setStorageDriver(noopStorage);
});

/** A media item for the others to reference. */
async function mediaTarget(): Promise<string> {
    const row = await getMediaRepository().create(
        { filename: 'target.png', mimeType: 'image/png', size: 1 },
        {}
    );
    return row.id;
}

describe.each(RESOURCE_TYPES)('%s', (kind) => {
    const adapter = ADAPTERS[kind];

    it('answers a missing one with 404 NOT_FOUND', async () => {
        await expect(adapter.missing()).rejects.toMatchObject({
            name: 'ResourceNotFoundError',
            status: 404,
            code: 'NOT_FOUND',
            kind,
        });
    });

    it('refuses a locale it cannot hold', async () => {
        const id = await adapter.save({ title: 'One' });
        await expect(adapter.update(id, { title: 'Eins' }, 'de')).rejects.toMatchObject({
            name: 'ResourceValidationError',
        });
    });

    it('round-trips a version', async () => {
        const id = await adapter.save({ title: 'One' });
        await adapter.update(id, { title: 'Two' });

        const [version] = await adapter.versions(id);
        expect(version).toBeDefined();
        const restored = await adapter.restore(id, version?.id ?? '');
        expect(restored.fields['title']).toBe('One');
    });

    it('reaches usedBy through its references', async () => {
        const target = await mediaTarget();
        await adapter.save({ title: 'Holder', logo: target });

        const usage = await mediaService.usedBy({ id: target });
        expect(usage.map((row) => row.sourceKind)).toContain(kind);
    });

    it('answers an unknown sort with 400, or has no list', async () => {
        if (adapter.list === undefined) {
            expect(RESOURCE_SPECS[kind].sortable).toEqual([]);
            return;
        }
        await expect(adapter.list({ nope: 'asc' })).rejects.toMatchObject({
            name: 'UnknownSortKeyError',
            status: 400,
        });
    });
});
