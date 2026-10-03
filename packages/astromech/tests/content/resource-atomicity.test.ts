/**
 * A write that touches more than one row runs in one transaction, so when one
 * of its writes fails, every other row it wrote rolls back with it. Each row of
 * the table is one such write: what it needs first, the call that fails, and
 * what must still hold afterwards. The failure is a trigger on a real table,
 * the `relationships` index unless a row names another, so every write that
 * fails there must name a target. Where the risk is an orphaned row no read
 * path shows, the check counts rows.
 */

import type { Table } from '@/database/define-table';
import type { StorageDriver } from '@/types/index';
import {
    createTestDb,
    createTestStorage,
    failWritesTo,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable, relationshipsTable } from '@/database/tables';
import { mediaRepository } from '@/media/repository';
import { listAll } from '@/storage/prefix';
import { usersTable } from '@/users/tables';

const entriesService = currentServices.entries;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** The storage the config's driver writes to, so a check can list what it holds. */
let storage: StorageDriver;

/** One write that must be atomic. */
type AtomicWrite = {
    name: string;
    /** Which write fails: an insert, or a delete. */
    failing: 'insert' | 'delete';
    /** The table that write goes to; the `relationships` index by default. */
    failingTable?: Table;
    /** Write what the call needs; answer the call and the check after it. */
    arrange(): Promise<{ act(): Promise<unknown>; expectUnchanged(): Promise<void> }>;
};

const WRITES: AtomicWrite[] = [
    {
        name: 'entries.create',
        failing: 'insert',
        async arrange() {
            const target = await post();
            return {
                act: () =>
                    entriesService.create({
                        type: 'post',
                        data: {
                            title: 'Orphan candidate',
                            fields: { related: [target] },
                        },
                    }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows.map((row) => row.id)).toEqual([target]);
                },
            };
        },
    },
    {
        name: 'entries.duplicate',
        failing: 'insert',
        async arrange() {
            const target = await post();
            const source = await entriesService.create({
                type: 'post',
                data: { title: 'Source', fields: { related: [target] } },
            });
            return {
                act: () => entriesService.duplicate({ type: 'post', id: source.id }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows.map((row) => row.id).sort()).toEqual(
                        [target, source.id].sort()
                    );
                },
            };
        },
    },
    {
        name: 'entries.restoreVersion',
        failing: 'insert',
        async arrange() {
            const target = await post();
            const entry = await entriesService.create({
                type: 'post',
                data: { title: 'Orig', fields: { body: 'orig', related: [target] } },
            });
            await entriesService.update({
                type: 'post',
                id: entry.id,
                data: { title: 'Changed', fields: { body: 'changed', related: [] } },
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
                    const read = await entriesService.get({
                        type: 'post',
                        id: entry.id,
                        full: true,
                    });
                    expect(read?.title).toBe('Changed');
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
            const target = await post();
            const canonical = await entriesService.create({
                type: 'post',
                data: { title: 'Canonical', fields: { related: [target] } },
            });
            return {
                act: () =>
                    entriesService.createStaged({ type: 'post', id: canonical.id }),
                async expectUnchanged() {
                    const rows = await getDb()
                        .selectFrom('entries')
                        .selectAll()
                        .execute();
                    expect(rows.map((row) => row.id).sort()).toEqual(
                        [target, canonical.id].sort()
                    );
                },
            };
        },
    },
    {
        name: 'entries.deleteStaged',
        failing: 'delete',
        async arrange() {
            const canonical = await entriesService.create({
                type: 'post',
                data: { title: 'Canonical', fields: { related: [await post()] } },
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
        // The file is stored before the row is written, so a failed write
        // must remove it too.
        name: 'media.upload',
        failing: 'insert',
        async arrange() {
            const target = await post();
            return {
                act: () =>
                    mediaService.upload({
                        file: new File(['bytes'], 'photo.txt', { type: 'text/plain' }),
                        data: { fields: { credit: 'credit', cover: target } },
                    }),
                async expectUnchanged() {
                    expect((await mediaService.query({})).data).toEqual([]);
                    expect(await listAll(storage, '')).toEqual([]);
                },
            };
        },
    },
    {
        name: 'media.update',
        failing: 'insert',
        async arrange() {
            const id = await mediaItem();
            const target = await post();
            return {
                act: () =>
                    mediaService.update({
                        id,
                        data: {
                            alt: 'second alt',
                            fields: { credit: 'second', cover: target },
                        },
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
            const id = await mediaItem(await post());
            await mediaService.update({
                id,
                data: { alt: 'second alt', fields: { credit: 'second', cover: null } },
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
            const target = await post();
            return {
                act: () =>
                    usersService.create({
                        data: {
                            email: 'bob@test.dev',
                            name: 'Bob',
                            fields: { favourite: target },
                        },
                    }),
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
            const target = await post();
            return {
                act: () =>
                    usersService.update({
                        id,
                        data: {
                            name: 'Annabel',
                            fields: { bio: 'second bio', favourite: target },
                        },
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
            const id = await ann(await post());
            await usersService.update({
                id,
                data: { fields: { bio: 'second bio', favourite: null } },
            });
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
        // `delete` drops the user's relationship rows, then the `users` row
        // (which clears the author columns that name the user). The users row
        // delete fails, so the relationship delete before it must roll back.
        name: 'users.delete',
        failing: 'delete',
        failingTable: usersTable,
        async arrange() {
            const favourite = await post();
            const id = await ann(favourite);
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
                    const index = await getDb()
                        .selectFrom('relationships')
                        .select(['sourceId', 'targetId'])
                        .execute();
                    expect(index).toEqual([{ sourceId: id, targetId: favourite }]);
                },
            };
        },
    },
];

/** A post for a write to reference; answers its id. */
async function post(): Promise<string> {
    return (await entriesService.create({ type: 'post', data: { title: 'Target' } })).id;
}

/** A media item whose content was authored without a version or an index row. */
async function mediaItem(cover: string | null = null): Promise<string> {
    const row = await mediaRepository.create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt', fields: { credit: 'first credit', cover } }
    );
    return row.id;
}

/** The user Ann, with a bio and, when given, a favourite post. */
async function ann(favourite: string | null = null): Promise<string> {
    const user = await usersService.create({
        data: {
            email: 'ann@test.dev',
            name: 'Ann',
            fields: { bio: 'first bio', favourite },
        },
    });
    return user.id;
}

beforeEach(async () => {
    await createTestDb();
    storage = createTestStorage();
    const base = makeTestConfig();
    setupTestConfig({
        ...base,
        storage,
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
            fields: [
                { name: 'credit', type: 'text', label: 'Credit' },
                { name: 'cover', type: 'relationship', label: 'Cover', target: 'post' },
            ],
        },
        users: {
            translatable: true,
            fields: [
                { name: 'bio', type: 'text', label: 'Bio' },
                {
                    name: 'favourite',
                    type: 'relationship',
                    label: 'Favourite',
                    target: 'post',
                },
            ],
        },
    });
});

describe('a write that touches more than one row', () => {
    it.each(WRITES)(
        '$name leaves every row as it was when one of its writes fails',
        async ({ failing, failingTable = relationshipsTable, arrange }) => {
            const { act, expectUnchanged } = await arrange();

            const stopFailing = await failWritesTo(failingTable, failing);
            await expect(act()).rejects.toThrow('boom');
            await stopFailing();

            await expectUnchanged();
        }
    );
});
