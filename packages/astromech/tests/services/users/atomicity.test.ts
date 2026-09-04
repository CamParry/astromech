/**
 * Atomicity for the four user writes that touch more than one row.
 *
 * `create`, `update` and `restoreVersion` each write rows and re-index the
 * user's relationships inside one transaction, and `delete` clears the author
 * columns before dropping the row, so a failing relationship write must leave
 * every other row untouched.
 */

import type * as RelationshipRepositoryModule from '@/database/repository/relationships';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable } from '@/database/tables';
import { usersService as api } from '@/users/service';
import { makeTranslatableUsersConfig } from './users-config';

// The relationship writes only reject once `state.failing` is set, so the
// earlier setup writes still succeed.
const state = vi.hoisted(() => ({ failing: false, failingDelete: false }));

vi.mock('@/database/repository/relationships', async (importOriginal) => {
    const actual = await importOriginal<typeof RelationshipRepositoryModule>();
    return {
        ...actual,
        createRelationshipRepository: (
            ...args: Parameters<typeof actual.createRelationshipRepository>
        ) => {
            const repository = actual.createRelationshipRepository(...args);
            return {
                ...repository,
                replaceForSource: (
                    ...replaceArgs: Parameters<typeof repository.replaceForSource>
                ): Promise<void> =>
                    state.failing
                        ? Promise.reject(new Error('boom'))
                        : repository.replaceForSource(...replaceArgs),
                deleteByResource: (
                    ...deleteArgs: Parameters<typeof repository.deleteByResource>
                ): Promise<void> =>
                    state.failingDelete
                        ? Promise.reject(new Error('boom'))
                        : repository.deleteByResource(...deleteArgs),
            };
        },
    };
});

let dbCounter = 0;
let dbPath = '';
let id: string;

beforeEach(async () => {
    // A rolled-back transaction poisons the harness's `:memory:` base connection
    // (post-rollback reads throw "no such table"), so read the result back off a
    // per-test temp FILE db.
    dbCounter += 1;
    dbPath = join(tmpdir(), `astromech-users-atomicity-${process.pid}-${dbCounter}.db`);
    await createFileTestDb(`file:${dbPath}`);
    setupTestConfig(makeTranslatableUsersConfig());
    state.failing = false;
    state.failingDelete = false;

    const user = await api.create({
        data: { email: 'ann@test.dev', name: 'Ann', fields: { bio: 'first bio' } },
    });
    id = user.id;
});

afterEach(() => {
    vi.restoreAllMocks();
    for (const suffix of ['', '-wal', '-shm']) {
        try {
            rmSync(`${dbPath}${suffix}`);
        } catch {
            // best-effort cleanup
        }
    }
});

describe('create atomicity', () => {
    it('leaves no user row when relationship persistence throws', async () => {
        state.failing = true;
        await expect(
            api.create({ data: { email: 'bob@test.dev', name: 'Bob' } })
        ).rejects.toThrow('boom');

        state.failing = false;
        const { data } = await api.query({ limit: 'all' });
        expect(data.map((user) => user.email)).toEqual(['ann@test.dev']);
    });
});

describe('update atomicity', () => {
    it('rolls back the version and the row when relationship persistence throws', async () => {
        state.failing = true;
        await expect(
            api.update({ id, data: { name: 'Annabel', fields: { bio: 'second bio' } } })
        ).rejects.toThrow('boom');

        state.failing = false;
        const user = await api.get({ id });
        expect(user?.name).toBe('Ann');
        expect(user?.fields['bio']).toBe('first bio');
        expect(await api.versions({ id })).toEqual([]);
    });
});

describe('restoreVersion atomicity', () => {
    it('rolls back the snapshot and the row when relationship persistence throws', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version snapshot');

        state.failing = true;
        await expect(api.restoreVersion({ id, versionId: version.id })).rejects.toThrow(
            'boom'
        );

        state.failing = false;
        const user = await api.get({ id });
        expect(user?.fields['bio']).toBe('second bio');
        expect(await api.versions({ id })).toHaveLength(1);
    });
});

describe('delete atomicity', () => {
    it('leaves the author columns and the row when the relationship delete throws', async () => {
        const entries = createRepository(entriesTable);
        const entry = await entries.create({
            type: 'post',
            createdBy: id,
            updatedBy: id,
        });

        state.failingDelete = true;
        await expect(api.delete({ id })).rejects.toThrow('boom');

        state.failingDelete = false;
        expect(await api.get({ id })).not.toBeNull();
        expect(await entries.findOne({ id: entry.id })).toMatchObject({
            createdBy: id,
            updatedBy: id,
        });
    });
});
