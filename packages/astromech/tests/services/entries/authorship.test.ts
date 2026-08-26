/**
 * `createdBy` and `updatedBy` on the entries table.
 *
 * Both columns have existed and been writable since the table was declared, and
 * no service path filled either, so every entry in every install held null.
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

/** Read the two columns straight from the table, not through the service. */
async function stamps(id: string) {
    return db
        .selectFrom('entries')
        .select(['createdBy', 'updatedBy'])
        .where('id', '=', id)
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
        const staged = await runAsUser(other, () =>
            api.createStaged({ type: 'post', id: canonical.id })
        );
        expect(await stamps(staged.id)).toEqual({
            createdBy: other.id,
            updatedBy: other.id,
        });
    });
});
