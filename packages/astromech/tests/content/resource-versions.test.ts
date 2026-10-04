/**
 * Version history behaves the same on every resource: a version snapshots the
 * state an update replaces, the sequence runs per resource and locale, and a
 * version is addressed by the resource, the locale and its number. Each
 * resource's versioned value and snapshot shape is a row in the adapter table.
 */

import type { Db } from '@/database/types';
import type { PluginHooks, ResolvedConfig, ResourceType } from '@/types/index';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    registerTestPlugins,
    runAsUser,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { ResourceNotFoundError } from '@/errors/resource';
import { mediaRepository } from '@/media/repository';
import { defineHook } from '@/plugins/define-hook';
import { RESOURCE_TYPES } from '@/types/domain';
import { userRepository } from '@/users/repository';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** One saved version's metadata, as `versions` lists it. */
type VersionItem = { version: number; locale: string; createdBy: string | null };

/** One version read back, as `getVersion` answers it. */
type VersionRead = VersionItem & { snapshot: object };

/**
 * How the checks reach one resource's history. Each resource versions one text
 * value: an entry's `body` field, the global's `title`, a user's `bio` and a
 * media item's `alt`. `id` is a global's key.
 */
type Adapter = {
    /** Create one holding `value` in the default locale, writing no version. */
    create(value: string): Promise<string>;
    /** Write `value` to one locale of it. */
    write(id: string, value: string, locale?: string): Promise<unknown>;
    /** Read it back in one locale. */
    read(id: string, locale?: string): Promise<{ locale: string } | null>;
    versions(id: string, locale?: string): Promise<VersionItem[]>;
    getVersion(id: string, version: number, locale?: string): Promise<VersionRead>;
    restore(id: string, version: number, locale?: string): Promise<{ locale: string }>;
    /** The versioned value a read or a restore answered. */
    valueOf(resource: object | null): unknown;
    /** The versioned value a snapshot holds. */
    snapshotValue(snapshot: object): unknown;
    /** The whole snapshot of the state that held `value` since creation. */
    snapshot(value: string): object;
    /** How a missing version names the resource. */
    label(id: string): string;
    /**
     * Make the next `write` meet a competing write of `value`, landing after
     * that write read the row and before it writes: from a before-update hook
     * where the resource has one, else from inside its first read.
     */
    interleave(id: string, value: string): void;
};

/** The resolved config of the current test, for registering a probe plugin. */
let resolved: ResolvedConfig;

/** The current test's database, for creating an acting user. */
let db: Db;

/** Register a probe plugin whose hooks run once each. */
function probe(hooks: PluginHooks): void {
    registerTestPlugins([{ package: '@test/probe', hooks }], resolved);
}

/** Runs `act` on the first call only, so a write it makes does not run it again. */
function once(act: () => Promise<unknown>): () => Promise<void> {
    let done = false;
    return async () => {
        if (done) return;
        done = true;
        await act();
    };
}

/** Makes each created user's email unique. */
let users = 0;

/** Reads a nested text value out of a resource or snapshot. */
function fieldOf(source: object | null, name: string): unknown {
    const fields = (source as { fields?: Record<string, unknown> } | null)?.fields;
    return fields?.[name];
}

const ADAPTERS: Record<ResourceType, Adapter> = {
    entry: {
        async create(value) {
            const entry = await entriesService.create({
                type: 'post',
                data: { title: 'Post', fields: { body: value } },
            });
            return entry.id;
        },
        write: (id, value, locale) =>
            entriesService.update({
                type: 'post',
                id,
                ...(locale ? { locale } : {}),
                data: { fields: { body: value } },
            }),
        read: (id, locale) =>
            entriesService.get({
                type: 'post',
                id,
                full: true,
                ...(locale ? { locale } : {}),
            }),
        versions: (id, locale) =>
            entriesService.versions({ type: 'post', id, ...(locale ? { locale } : {}) }),
        getVersion: (id, version, locale) =>
            entriesService.getVersion({
                type: 'post',
                id,
                version,
                ...(locale ? { locale } : {}),
            }),
        restore: (id, version, locale) =>
            entriesService.restoreVersion({
                type: 'post',
                id,
                version,
                ...(locale ? { locale } : {}),
            }),
        valueOf: (resource) => fieldOf(resource, 'body'),
        snapshotValue: (snapshot) => fieldOf(snapshot, 'body'),
        snapshot: (value) => ({ title: 'Post', slug: 'post', fields: { body: value } }),
        label: (id) => `Entry '${id}'`,
        interleave(id, value) {
            const write = once(() => ADAPTERS.entry.write(id, value));
            probe([defineHook('entry:beforeUpdate', write)]);
        },
    },
    global: {
        async create(value) {
            await globalsService.update({
                key: 'site',
                data: { fields: { title: value } },
            });
            return 'site';
        },
        write: (key, value, locale) =>
            globalsService.update({
                key,
                ...(locale ? { locale } : {}),
                data: { fields: { title: value } },
            }),
        read: (key, locale) =>
            globalsService.get({ key, full: true, ...(locale ? { locale } : {}) }),
        versions: (key, locale) =>
            globalsService.versions({ key, ...(locale ? { locale } : {}) }),
        getVersion: (key, version, locale) =>
            globalsService.getVersion({ key, version, ...(locale ? { locale } : {}) }),
        restore: (key, version, locale) =>
            globalsService.restoreVersion({
                key,
                version,
                ...(locale ? { locale } : {}),
            }),
        valueOf: (resource) => fieldOf(resource, 'title'),
        snapshotValue: (snapshot) => fieldOf(snapshot, 'title'),
        snapshot: (value) => ({ fields: { title: value } }),
        label: (key) => `Global '${key}'`,
        interleave(key, value) {
            const write = once(() => ADAPTERS.global.write(key, value));
            probe([defineHook('global:beforeUpdate', write)]);
        },
    },
    user: {
        async create(value) {
            const user = await usersService.create({
                data: {
                    email: `user${String((users += 1))}@test.dev`,
                    name: 'Ann',
                    fields: { bio: value },
                },
            });
            return user.id;
        },
        write: (id, value, locale) =>
            usersService.update({
                id,
                ...(locale ? { locale } : {}),
                data: { fields: { bio: value } },
            }),
        read: (id, locale) => usersService.get({ id, ...(locale ? { locale } : {}) }),
        versions: (id, locale) =>
            usersService.versions({ id, ...(locale ? { locale } : {}) }),
        getVersion: (id, version, locale) =>
            usersService.getVersion({ id, version, ...(locale ? { locale } : {}) }),
        restore: (id, version, locale) =>
            usersService.restoreVersion({ id, version, ...(locale ? { locale } : {}) }),
        valueOf: (resource) => fieldOf(resource, 'bio'),
        snapshotValue: (snapshot) => fieldOf(snapshot, 'bio'),
        snapshot: (value) => ({ fields: { bio: value } }),
        label: (id) => `User '${id}'`,
        interleave(id, value) {
            const findOne = userRepository.findOne;
            vi.spyOn(userRepository, 'findOne').mockImplementationOnce(
                async (...args) => {
                    const read = await findOne(...args);
                    await ADAPTERS.user.write(id, value);
                    return read;
                }
            );
        },
    },
    media: {
        // Authored through the repository, so the item starts with content but no
        // version: an `upload` stores no alt text to start from.
        async create(value) {
            const row = await mediaRepository.create(
                { filename: 'photo.png', mimeType: 'image/png', size: 1 },
                { alt: value }
            );
            return row.id;
        },
        write: (id, value, locale) =>
            mediaService.update({
                id,
                ...(locale ? { locale } : {}),
                data: { alt: value },
            }),
        read: (id, locale) => mediaService.get({ id, ...(locale ? { locale } : {}) }),
        versions: (id, locale) =>
            mediaService.versions({ id, ...(locale ? { locale } : {}) }),
        getVersion: (id, version, locale) =>
            mediaService.getVersion({ id, version, ...(locale ? { locale } : {}) }),
        restore: (id, version, locale) =>
            mediaService.restoreVersion({ id, version, ...(locale ? { locale } : {}) }),
        valueOf: (resource) => (resource as { alt?: unknown } | null)?.alt,
        snapshotValue: (snapshot) => (snapshot as { alt?: unknown }).alt,
        snapshot: (value) => ({ title: null, alt: value, caption: null, fields: {} }),
        label: (id) => `Media '${id}'`,
        interleave(id, value) {
            const findOne = mediaRepository.findOne;
            vi.spyOn(mediaRepository, 'findOne').mockImplementationOnce(
                async (...args) => {
                    const read = await findOne(...args);
                    await ADAPTERS.media.write(id, value);
                    return read;
                }
            );
        },
    },
};

beforeEach(async () => {
    db = await createTestDb();
    resolved = setupTestConfig({
        ...makeTestConfig(),
        globals: [
            {
                key: 'site',
                label: 'Site',
                translatable: true,
                fields: [{ name: 'title', type: 'text', label: 'Title' }],
            },
        ],
        users: {
            translatable: true,
            fields: [{ name: 'bio', type: 'text', label: 'Bio' }],
        },
        media: { translatable: true },
    });
});

describe.each(RESOURCE_TYPES)('%s', (kind) => {
    const adapter = ADAPTERS[kind];

    describe('versions', () => {
        it('snapshots the pre-update state when its content changes', async () => {
            const id = await adapter.create('one');
            await adapter.write(id, 'two');

            const versions = await adapter.versions(id);
            expect(versions).toHaveLength(1);
            expect(versions[0]?.version).toBe(1);
            expect(versions[0]?.locale).toBe('en');
            const version = await adapter.getVersion(id, 1);
            expect(version.snapshot).toEqual(adapter.snapshot('one'));
        });

        it('lists metadata only, with no snapshot and no row id', async () => {
            const id = await adapter.create('one');
            await adapter.write(id, 'two');

            const [item] = await adapter.versions(id);
            expect(Object.keys(item ?? {}).sort()).toEqual([
                'createdAt',
                'createdBy',
                'locale',
                'version',
            ]);
        });

        it('writes no version when the content is unchanged', async () => {
            const id = await adapter.create('same');
            await adapter.write(id, 'same');

            expect(await adapter.versions(id)).toEqual([]);
        });

        it('lists newest first', async () => {
            const id = await adapter.create('a');
            for (const value of ['b', 'c', 'd']) await adapter.write(id, value);

            const versions = await adapter.versions(id);
            expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
            const values = await Promise.all(
                versions.map(async (v) =>
                    adapter.snapshotValue(
                        (await adapter.getVersion(id, v.version)).snapshot
                    )
                )
            );
            expect(values).toEqual(['c', 'b', 'a']);
        });

        it('writes no version for the write that creates a locale', async () => {
            const id = await adapter.create('EN');
            await adapter.write(id, 'DE', 'de');

            expect(await adapter.versions(id, 'de')).toEqual([]);
        });

        it('keeps a separate sequence per locale', async () => {
            const id = await adapter.create('EN 1');
            await adapter.write(id, 'DE 1', 'de');
            await adapter.write(id, 'DE 2', 'de');
            await adapter.write(id, 'EN 2');

            const en = await adapter.versions(id);
            const de = await adapter.versions(id, 'de');
            expect(en.map((v) => v.version)).toEqual([1]);
            expect(de.map((v) => v.version)).toEqual([1]);
            expect(en[0]?.locale).toBe('en');
            expect(de[0]?.locale).toBe('de');

            const enFirst = await adapter.getVersion(id, 1);
            const deFirst = await adapter.getVersion(id, 1, 'de');
            expect(adapter.snapshotValue(enFirst.snapshot)).toBe('EN 1');
            expect(adapter.snapshotValue(deFirst.snapshot)).toBe('DE 1');
            expect(deFirst.locale).toBe('de');
        });

        it('snapshots the row as the write found it, with a change made after its read', async () => {
            const id = await adapter.create('one');
            adapter.interleave(id, 'between');

            await adapter.write(id, 'two');

            const [latest] = await adapter.versions(id);
            const version = await adapter.getVersion(id, latest?.version ?? 0);
            expect(adapter.snapshotValue(version.snapshot)).toBe('between');
            expect(adapter.valueOf(await adapter.read(id))).toBe('two');
        });

        it('credits a version to the acting user, and to nobody outside a request', async () => {
            const editor = await createTestUser(db, { name: 'Editor' });
            const id = await adapter.create('one');
            await runAsUser(editor, () => adapter.write(id, 'two'));
            await adapter.write(id, 'three');

            const versions = await adapter.versions(id);
            expect(versions.map((v) => [v.version, v.createdBy])).toEqual([
                [2, null],
                [1, editor.id],
            ]);
        });

        it('throws for a locale with no content row', async () => {
            const id = await adapter.create('one');

            await expect(adapter.versions(id, 'de')).rejects.toThrow(
                ResourceNotFoundError
            );
        });
    });

    describe('getVersion', () => {
        it('answers the metadata and the snapshot, with no internal key', async () => {
            const id = await adapter.create('one');
            await adapter.write(id, 'two');

            const version = await adapter.getVersion(id, 1);
            expect(Object.keys(version).sort()).toEqual([
                'createdAt',
                'createdBy',
                'locale',
                'snapshot',
                'version',
            ]);
            expect(version).toMatchObject({ version: 1, locale: 'en' });
            expect(version.snapshot).toEqual(adapter.snapshot('one'));
        });

        it('refuses a number the locale has no version for', async () => {
            const id = await adapter.create('one');

            const refused = adapter.getVersion(id, 1);
            await expect(refused).rejects.toBeInstanceOf(ResourceNotFoundError);
            await expect(refused).rejects.toThrow(
                `${adapter.label(id)} has no version 1 in locale 'en'`
            );
        });
    });

    describe('restoreVersion', () => {
        it('writes the version back and snapshots the state it overwrote', async () => {
            const id = await adapter.create('one');
            await adapter.write(id, 'two');

            const restored = await adapter.restore(id, 1);
            expect(adapter.valueOf(restored)).toBe('one');

            const after = await adapter.versions(id);
            expect(after.map((v) => v.version)).toEqual([2, 1]);
            const saved = await adapter.getVersion(id, 2);
            expect(adapter.snapshotValue(saved.snapshot)).toBe('two');
        });

        it('restores into its own locale, leaving the other alone', async () => {
            const id = await adapter.create('EN 1');
            await adapter.write(id, 'DE 1', 'de');
            await adapter.write(id, 'DE 2', 'de');

            const restored = await adapter.restore(id, 1, 'de');

            expect(adapter.valueOf(restored)).toBe('DE 1');
            expect(restored.locale).toBe('de');
            expect(adapter.valueOf(await adapter.read(id))).toBe('EN 1');
        });

        it('refuses a number only another locale has a version for', async () => {
            const id = await adapter.create('EN 1');
            await adapter.write(id, 'EN 2');
            await adapter.write(id, 'DE', 'de');

            await expect(adapter.restore(id, 1, 'de')).rejects.toBeInstanceOf(
                ResourceNotFoundError
            );
        });

        it('refuses an unknown version number', async () => {
            const id = await adapter.create('one');

            const refused = adapter.restore(id, 7);
            await expect(refused).rejects.toBeInstanceOf(ResourceNotFoundError);
            await expect(refused).rejects.toThrow(
                `${adapter.label(id)} has no version 7 in locale 'en'`
            );
        });
    });
});

// Media is left out: its adapter creates through the repository, which writes
// no version whatever the service does. Its own create path is `upload`, below.
describe.each(RESOURCE_TYPES.filter((kind) => kind !== 'media'))('%s', (kind) => {
    it('writes no version when it is created, which replaces nothing', async () => {
        const id = await ADAPTERS[kind].create('one');

        expect(await ADAPTERS[kind].versions(id)).toEqual([]);
    });
});

describe('media', () => {
    it('writes no version when it is uploaded, which replaces nothing', async () => {
        const file = new File(['hello'], 'doc.txt', { type: 'text/plain' });
        const uploaded = await mediaService.upload({ file });

        expect(await mediaService.versions({ id: uploaded.id })).toEqual([]);
    });
});
