/**
 * `usersService` CRUD + list behaviour, pinned across the move onto users storage.
 *
 * `users` storage is hand-rolled (better-auth owns the table, so there is no
 * `Table` for `createRepository` to wrap), which means its sort
 * whitelist, its name/email search OR, its count and its `updatedAt` stamp are
 * all local code rather than shared wrapper code — and none of it was covered.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_SLUG } from '@/permissions/index';
import { usersService } from '@/users/service';

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    await createTestUser(db, { name: 'Zoe', email: 'zoe@test.dev' });
    await createTestUser(db, { name: 'Adam', email: 'adam@test.dev' });
});

describe('usersService.query', () => {
    it('sorts by name ascending by default', async () => {
        const result = await usersService.query({ limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Adam', 'Zoe']);
        expect(result.pagination?.total).toBe(2);
    });

    it('honours an explicit sort', async () => {
        const result = await usersService.query({ sort: { name: 'desc' }, limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Zoe', 'Adam']);
    });

    it('falls back to the default sort for an unsortable column', async () => {
        const result = await usersService.query({ sort: { fields: 'desc' }, limit: 10 });
        expect(result.data.map((u) => u.name)).toEqual(['Adam', 'Zoe']);
    });

    it('searches name OR email, and counts only matches', async () => {
        const byName = await usersService.query({ search: 'Zo', limit: 10 });
        expect(byName.data.map((u) => u.name)).toEqual(['Zoe']);
        expect(byName.pagination?.total).toBe(1);

        const byEmail = await usersService.query({ search: 'adam@', limit: 10 });
        expect(byEmail.data.map((u) => u.name)).toEqual(['Adam']);
        expect(byEmail.pagination?.total).toBe(1);
    });

    it('returns every row unpaginated for limit: all', async () => {
        const result = await usersService.query({ limit: 'all' });
        expect(result.data.length).toBe(2);
        expect(result.pagination).toBeNull();
    });

    it('counts every match, not just the page', async () => {
        const result = await usersService.query({ limit: 1, page: 2 });
        expect(result.data.map((u) => u.name)).toEqual(['Zoe']);
        expect(result.pagination).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
    });
});

describe('usersService create / get / update / delete', () => {
    it('creates with the default role and decoded timestamps', async () => {
        const created = await usersService.create({ email: 'new@test.dev', name: 'New' });

        expect(created.roleSlug).toBe(DEFAULT_ROLE_SLUG);
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.updatedAt).toBeInstanceOf(Date);
        expect(await usersService.get({ id: created.id })).toMatchObject({ name: 'New' });
    });

    it('creates with an explicit role', async () => {
        const created = await usersService.create({
            email: 'ed@test.dev',
            name: 'Ed',
            roleSlug: 'editor',
        });
        expect(created.roleSlug).toBe('editor');
    });

    it('leaves columns absent from the patch alone', async () => {
        const created = await usersService.create({
            email: 'p@test.dev',
            name: 'Patchable',
        });

        const patched = await usersService.update({
            id: created.id,
            data: { name: 'Renamed' },
        });
        expect(patched.name).toBe('Renamed');
        expect(patched.email).toBe('p@test.dev');
        expect(patched.roleSlug).toBe(created.roleSlug);
    });

    it('throws when updating a row that does not exist', async () => {
        await expect(
            usersService.update({ id: 'nope', data: { name: 'x' } })
        ).rejects.toThrow(/nope/);
    });

    it('returns null for an unknown id', async () => {
        expect(await usersService.get({ id: 'nope' })).toBeNull();
    });

    it('deletes the row', async () => {
        const created = await usersService.create({
            email: 'd@test.dev',
            name: 'Doomed',
        });

        await usersService.delete({ id: created.id });
        expect(await usersService.get({ id: created.id })).toBeNull();
    });
});
