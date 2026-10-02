/**
 * A write that touches more than one row runs in one transaction, so when its
 * relationship index write fails, every other row it wrote rolls back with it.
 * Each row of the table is one such write: what it needs first, the call that
 * fails, and what must still hold afterwards.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable } from '@/database/tables';
import { mediaRepository } from '@/media/repository';

const entriesService = currentServices.entries;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** One write that must be atomic. */
type AtomicWrite = {
    name: string;
    /** Which relationship index write fails: the insert, or the delete. */
    failing: 'insert' | 'delete';
    /** Write what the call needs; answer the call and the check after it. */
    arrange(): Promise<{ act(): Promise<unknown>; expectUnchanged(): Promise<void> }>;
};

const WRITES: AtomicWrite[] = [
    {
        name: 'entries.create',
        failing: 'insert',
        async arrange() {
            return {
                act: () =>
                    entriesService.create({
                        type: 'post',
                        data: {
                            title: 'Orphan candidate',
                            fields: { related: [crypto.randomUUID()] },
                        },
                    }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows).toHaveLength(0);
                },
            };
        },
    },
    {
        name: 'entries.duplicate',
        failing: 'insert',
        async arrange() {
            const source = await entriesService.create({
                type: 'post',
                data: { title: 'Source' },
            });
            return {
                act: () => entriesService.duplicate({ type: 'post', id: source.id }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows).toHaveLength(1);
                    expect(rows[0]?.id).toBe(source.id);
                },
            };
        },
    },
    {
        name: 'entries.restoreVersion',
        failing: 'insert',
        async arrange() {
            const entry = await entriesService.create({
                type: 'post',
                data: { title: 'Orig', fields: { body: 'orig' } },
            });
            await entriesService.update({
                type: 'post',
                id: entry.id,
                data: { title: 'Changed', fields: { body: 'changed' } },
            });
            const versionsBefore = await entriesService.versions({
                type: 'post',
                id: entry.id,
            });
            const [v1] = versionsBefore;
            if (!v1) throw new Error('expected a version snapshot');
            return {
                act: () =>
                    entriesService.restoreVersion({
                        type: 'post',
                        id: entry.id,
                        version: v1.version,
                    }),
                async expectUnchanged() {
                    const row = await getDb()
                        .selectFrom('entryContent')
                        .selectAll()
                        .where('entryId', '=', entry.id)
                        .executeTakeFirstOrThrow();
                    expect(row.title).toBe('Changed');
                    const versionsAfter = await entriesService.versions({
                        type: 'post',
                        id: entry.id,
                    });
                    expect(versionsAfter).toHaveLength(versionsBefore.length);
                },
            };
        },
    },
    {
        name: 'entries.createStaged',
        failing: 'insert',
        async arrange() {
            const canonical = await entriesService.create({
                type: 'post',
                data: { title: 'Canonical' },
            });
            return {
                act: () =>
                    entriesService.createStaged({ type: 'post', id: canonical.id }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows).toHaveLength(1);
                    expect(rows[0]?.id).toBe(canonical.id);
                },
            };
        },
    },
    {
        name: 'entries.deleteStaged',
        failing: 'insert',
        async arrange() {
            const canonical = await entriesService.create({
                type: 'post',
                data: { title: 'Canonical' },
            });
            await entriesService.createStaged({ type: 'post', id: canonical.id });
            return {
                act: () =>
                    entriesService.deleteStaged({ type: 'post', id: canonical.id }),
                async expectUnchanged() {
                    const staged = await entriesService.getStaged({
                        type: 'post',
                        id: canonical.id,
                    });
                    expect(staged?.id).toBe(canonical.id);
                },
            };
        },
    },
    {
        name: 'media.update',
        failing: 'insert',
        async arrange() {
            const id = await mediaItem();
            return {
                act: () =>
                    mediaService.update({
                        id,
                        data: { alt: 'second alt', fields: { credit: 'second' } },
                    }),
                async expectUnchanged() {
                    const item = await mediaService.get({ id });
                    expect(item?.alt).toBe('first alt');
                    expect(item?.fields['credit']).toBe('first credit');
                    expect(await mediaService.versions({ id })).toEqual([]);
                },
            };
        },
    },
    {
        name: 'media.restoreVersion',
        failing: 'insert',
        async arrange() {
            const id = await mediaItem();
            await mediaService.update({
                id,
                data: { alt: 'second alt', fields: { credit: 'second' } },
            });
            const [version] = await mediaService.versions({ id });
            if (!version) throw new Error('expected a version snapshot');
            return {
                act: () => mediaService.restoreVersion({ id, version: version.version }),
                async expectUnchanged() {
                    const item = await mediaService.get({ id });
                    expect(item?.alt).toBe('second alt');
                    expect(await mediaService.versions({ id })).toHaveLength(1);
                },
            };
        },
    },
    {
        name: 'users.create',
        failing: 'insert',
        async arrange() {
            await ann();
            return {
                act: () =>
                    usersService.create({ data: { email: 'bob@test.dev', name: 'Bob' } }),
                async expectUnchanged() {
                    const { data } = await usersService.query({ limit: 'all' });
                    expect(data.map((user) => user.email)).toEqual(['ann@test.dev']);
                },
            };
        },
    },
    {
        name: 'users.update',
        failing: 'insert',
        async arrange() {
            const id = await ann();
            return {
                act: () =>
                    usersService.update({
                        id,
                        data: { name: 'Annabel', fields: { bio: 'second bio' } },
                    }),
                async expectUnchanged() {
                    const user = await usersService.get({ id });
                    expect(user?.name).toBe('Ann');
                    expect(user?.fields['bio']).toBe('first bio');
                    expect(await usersService.versions({ id })).toEqual([]);
                },
            };
        },
    },
    {
        name: 'users.restoreVersion',
        failing: 'insert',
        async arrange() {
            const id = await ann();
            await usersService.update({ id, data: { fields: { bio: 'second bio' } } });
            const [version] = await usersService.versions({ id });
            if (!version) throw new Error('expected a version snapshot');
            return {
                act: () => usersService.restoreVersion({ id, version: version.version }),
                async expectUnchanged() {
                    const user = await usersService.get({ id });
                    expect(user?.fields['bio']).toBe('second bio');
                    expect(await usersService.versions({ id })).toHaveLength(1);
                },
            };
        },
    },
    {
        // `delete` clears the author columns that name the user before it drops
        // the row, so a failing index delete must leave both.
        name: 'users.delete',
        failing: 'delete',
        async arrange() {
            const id = await ann();
            const entries = createRepository(entriesTable);
            const entry = await entries.create({
                type: 'post',
                createdBy: id,
                updatedBy: id,
            });
            return {
                act: () => usersService.delete({ id }),
                async expectUnchanged() {
                    expect(await usersService.get({ id })).not.toBeNull();
                    expect(await entries.findOne({ id: entry.id })).toMatchObject({
                        createdBy: id,
                        updatedBy: id,
                    });
                },
            };
        },
    },
];

/** A media item whose content was authored without a version. */
async function mediaItem(): Promise<string> {
    const row = await mediaRepository.create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt', fields: { credit: 'first credit' } }
    );
    return row.id;
}

/** The user Ann, with a bio. */
async function ann(): Promise<string> {
    const user = await usersService.create({
        data: { email: 'ann@test.dev', name: 'Ann', fields: { bio: 'first bio' } },
    });
    return user.id;
}

/**
 * Make the relationship index's `failing` write throw `boom` until the returned
 * function is called.
 */
function failRelationshipIndex(failing: 'insert' | 'delete'): () => void {
    const method = failing === 'insert' ? 'replaceForSource' : 'deleteByResource';
    const spy = vi
        .spyOn(relationshipRepository, method)
        .mockRejectedValue(new Error('boom'));
    return () => spy.mockRestore();
}

beforeEach(async () => {
    await createTestDb();
    const base = makeTestConfig();
    setupTestConfig({
        ...base,
        entries: {
            ...base.entries,
            post: {
                ...base.entries['post'],
                single: 'Post',
                plural: 'Posts',
                staging: true,
            },
        },
        media: {
            translatable: true,
            fields: [{ name: 'credit', type: 'text', label: 'Credit' }],
        },
        users: {
            translatable: true,
            fields: [{ name: 'bio', type: 'text', label: 'Bio' }],
        },
    });
});

describe('a write that touches more than one row', () => {
    it.each(WRITES)(
        '$name leaves every row as it was when its index write fails',
        async ({ failing, arrange }) => {
            const { act, expectUnchanged } = await arrange();

            const stopFailing = failRelationshipIndex(failing);
            await expect(act()).rejects.toThrow('boom');
            stopFailing();

            await expectUnchanged();
        }
    );
});
