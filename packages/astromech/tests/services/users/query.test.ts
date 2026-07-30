/**
 * `usersApi` CRUD + list behaviour, pinned across the move onto users storage.
 *
 * `users` storage is hand-rolled (better-auth owns the table, so there is no
 * `defineTable` descriptor for `createStorage` to wrap), which means its sort
 * whitelist, its name/email search OR, its count and its `updatedAt` stamp are
 * all local code rather than shared wrapper code — and none of it was covered.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness.js';
import { usersApi } from '@/users/service.js';
import type { DB } from '@/database/types.js';

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    await createTestUser(db, { name: 'Zoe', email: 'zoe@test.dev' });
    await createTestUser(db, { name: 'Adam', email: 'adam@test.dev' });
});

describe('usersApi.query', () => {
    it('sorts by name ascending by default', async () => {
        const result = await usersApi.query({ limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Adam', 'Zoe']);
        expect(result.pagination?.total).toBe(2);
    });

    it('honours an explicit sort', async () => {
        const result = await usersApi.query({ sort: { name: 'desc' }, limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Zoe', 'Adam']);
    });

    it('falls back to the default sort for an unsortable column', async () => {
        const result = await usersApi.query({ sort: { fields: 'desc' }, limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Adam', 'Zoe']);
    });

    it('searches name OR email, and counts only matches', async () => {
        const byName = await usersApi.query({ search: 'Zo', limit: 10 });
        expect(byName.data.map((u) => u.name)).toEqual(['Zoe']);
        expect(byName.pagination?.total).toBe(1);

        const byEmail = await usersApi.query({ search: 'adam@', limit: 10 });
        expect(byEmail.data.map((u) => u.name)).toEqual(['Adam']);
        expect(byEmail.pagination?.total).toBe(1);
    });

    it('returns every row unpaginated for limit: all', async () => {
        const result = await usersApi.query({ limit: 'all' });
        expect(result.data.length).toBe(2);
        expect(result.pagination).toBeNull();
    });

    it('counts every match, not just the page', async () => {
        const result = await usersApi.query({ limit: 1, page: 2 });
        expect(result.data.map((u) => u.name)).toEqual(['Zoe']);
        expect(result.pagination).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
    });
});

describe('usersApi create / get / update / delete', () => {
    it('creates with the default role and decoded timestamps', async () => {
        const created = await usersApi.create({ email: 'new@test.dev', name: 'New' });

        expect(created.roleSlug).toBe('admin');
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.updatedAt).toBeInstanceOf(Date);
        expect(await usersApi.get({ id: created.id })).toMatchObject({ name: 'New' });
    });

    it('creates with an explicit role', async () => {
        const created = await usersApi.create({
            email: 'ed@test.dev',
            name: 'Ed',
            roleSlug: 'editor',
        });
        expect(created.roleSlug).toBe('editor');
    });

    it('leaves columns absent from the patch alone', async () => {
        const created = await usersApi.create({ email: 'p@test.dev', name: 'Patchable' });

        const patched = await usersApi.update({
            id: created.id,
            data: { name: 'Renamed' },
        });
        expect(patched.name).toBe('Renamed');
        expect(patched.email).toBe('p@test.dev');
        expect(patched.roleSlug).toBe(created.roleSlug);
    });

    it('throws when updating a row that does not exist', async () => {
        await expect(
            usersApi.update({ id: 'nope', data: { name: 'x' } })
        ).rejects.toThrow(/nope/);
    });

    it('returns null for an unknown id', async () => {
        expect(await usersApi.get({ id: 'nope' })).toBeNull();
    });

    it('deletes the row', async () => {
        const created = await usersApi.create({ email: 'd@test.dev', name: 'Doomed' });

        await usersApi.delete({ id: created.id });
        expect(await usersApi.get({ id: created.id })).toBeNull();
    });
});
