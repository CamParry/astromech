/**
 * `createdBy` and `updatedBy` across the two entry tables: content writes stamp
 * the content row, and the resource-level ones (trash, restore) stamp `entries`.
 * These pin who each write records, and that a write with no request identity
 * (a seed script, the CLI, the scheduler) records nobody rather than failing.
 */

import type { DB } from '@/database/types';
import type { User } from '@/types/index';
import type { Kysely } from 'kysely';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    runAsUser,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';

let db: Kysely<DB>;
let author: User;
let other: User;

beforeEach(async () => {
    db = await createTestDb();
    const config = makeTestConfig();
    if (config.entries.post) config.entries.post.staging = true;
    setupTestConfig(config);
    author = (await createTestUser(db, {
        name: 'Author',
        email: 'author@test.dev',
    })) as unknown as User;
    other = (await createTestUser(db, {
        name: 'Other',
        email: 'other@test.dev',
    })) as unknown as User;
});

/** The canonical content row's two columns, read straight from the table. */
async function stamps(id: string) {
    return db
        .selectFrom('entryContent')
        .select(['createdBy', 'updatedBy'])
        .where((eb) => eb.and([eb('entryId', '=', id), eb('stagedFor', 'is', null)]))
        .executeTakeFirstOrThrow();
}

/** The same two columns on the `entries` row, which trash and restore stamp. */
async function resourceStamps(id: string) {
    return db
        .selectFrom('entries')
        .select(['createdBy', 'updatedBy'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
}

/** The staged content row's two columns. */
async function stagedStamps(id: string) {
    return db
        .selectFrom('entryContent')
        .select(['createdBy', 'updatedBy'])
        .where((eb) => eb.and([eb('entryId', '=', id), eb('stagedFor', 'is not', null)]))
        .executeTakeFirstOrThrow();
}

describe('create', () => {
    it('records the acting user on both columns', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Written' } })
        );
        expect(await stamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });

    it('records nobody when there is no request identity', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Seeded' } });
        expect(await stamps(entry.id)).toEqual({ createdBy: null, updatedBy: null });
    });

    it('surfaces both through the service', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Surfaced' } })
        );
        expect(entry.createdBy).toBe(author.id);
        expect(entry.updatedBy).toBe(author.id);
    });
});

describe('update', () => {
    it('moves updatedBy to the acting user and leaves createdBy alone', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'First' } })
        );
        await runAsUser(other, () =>
            api.update({ type: 'post', id: entry.id, data: { title: 'Second' } })
        );
        expect(await stamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: other.id,
        });
    });

    /**
     * A publish writes to the row, so it stamps, in step with `updatedAt`.
     * Whether it also takes a version snapshot is a separate question that
     * `changesVersionedContent` answers, and the two do not have to agree.
     */
    it('stamps on a status-only change', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Draft' } })
        );
        await runAsUser(other, () => api.publish({ type: 'post', id: entry.id }));
        expect(await stamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: other.id,
        });
    });

    it('clears updatedBy for a write with no request identity', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Held' } })
        );
        await api.update({ type: 'post', id: entry.id, data: { title: 'By a job' } });
        expect(await stamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: null,
        });
    });
});

describe('duplicate', () => {
    it('records the duplicating user, not the source author', async () => {
        const source = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Original' } })
        );
        const copy = await runAsUser(other, () =>
            api.duplicate({ type: 'post', id: source.id })
        );
        expect(await stamps(copy.id)).toEqual({
            createdBy: other.id,
            updatedBy: other.id,
        });
        expect(await stamps(source.id)).toEqual({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });
});

describe('createStaged', () => {
    it('records the user who staged the change', async () => {
        const canonical = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Live' } })
        );
        await runAsUser(other, () =>
            api.createStaged({ type: 'post', id: canonical.id })
        );
        expect(await stagedStamps(canonical.id)).toEqual({
            createdBy: other.id,
            updatedBy: other.id,
        });
        // The canonical row is untouched by staging a change off it.
        expect(await stamps(canonical.id)).toEqual({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });
});

describe('trash and restore', () => {
    it('records who trashed and who restored on the entry row', async () => {
        const entry = await runAsUser(author, () =>
            api.create({ type: 'post', data: { title: 'Doomed' } })
        );

        await runAsUser(other, () => api.trash({ type: 'post', id: entry.id }));
        expect(await resourceStamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: other.id,
        });

        await runAsUser(author, () => api.restore({ type: 'post', id: entry.id }));
        expect(await resourceStamps(entry.id)).toEqual({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });
});
