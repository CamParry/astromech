/**
 * Every handler in `routes/users.ts` over the real router.
 *
 * Users carries the two checks a method contract cannot state — self-access on
 * `get`/`update`, and the last-admin guard on `update`/`delete` — so these
 * assert the status, the envelope and the keys of all seven handlers, and pin
 * which role each one turns away.
 */

import type { DB } from '@/database/types';
import type { Role, User, UserVersion } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import {
    adminRole,
    mountRouter,
    roleWith,
    seedTestUser,
    testUser,
} from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { usersRouter } from '@/transport/http/routes/users';
import { usersService } from '@/users/service';

function app(role: Role = adminRole, user: User = testUser) {
    return mountRouter('/users', usersRouter, role, user);
}

/** Create a user through the Local API (no permission checks). */
async function makeUser(email: string, name: string, role?: string): Promise<User> {
    return usersService.create({
        data: {
            email,
            name,
            ...(role !== undefined && { role }),
        },
    });
}

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('GET /users', () => {
    it('returns { data, pagination } straight from the service', async () => {
        await makeUser('a@test.dev', 'Ann');
        await makeUser('b@test.dev', 'Bob');

        const res = await app().request('/users');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            data: User[];
            pagination: { page: number; limit: number; total: number; pages: number };
        };
        expect(Object.keys(body).sort()).toEqual(['data', 'pagination']);
        expect(body.data).toHaveLength(2);
        expect(body.pagination.total).toBe(2);
        expect(Object.keys(body.pagination).sort()).toEqual([
            'limit',
            'page',
            'pages',
            'total',
        ]);
    });

    it('applies search, page and limit from the query string', async () => {
        await makeUser('ann@test.dev', 'Ann');
        await makeUser('bob@test.dev', 'Bob');

        const searched = await app().request('/users?search=ann');
        expect(((await searched.json()) as { data: User[] }).data).toHaveLength(1);

        const paged = await app().request('/users?page=2&limit=1');
        const body = (await paged.json()) as {
            data: User[];
            pagination: { page: number; pages: number };
        };
        expect(body.data).toHaveLength(1);
        expect(body.pagination.page).toBe(2);
        expect(body.pagination.pages).toBe(2);
    });

    it('limit=all drops pagination to null', async () => {
        await makeUser('a@test.dev', 'Ann');
        const res = await app().request('/users?limit=all');
        expect(((await res.json()) as { pagination: unknown }).pagination).toBeNull();
    });

    it('sorts on an allowed field and ignores an unlisted one', async () => {
        await makeUser('b@test.dev', 'Bob');
        await makeUser('a@test.dev', 'Ann');

        const sorted = await app().request('/users?sort=name&dir=asc');
        expect(
            ((await sorted.json()) as { data: User[] }).data.map((u) => u.name)
        ).toEqual(['Ann', 'Bob']);

        // `id` is not in the route's SORTABLE_FIELDS, so the sort is dropped
        // rather than rejected — the service's default order stands.
        const unlisted = await app().request('/users?sort=id&dir=asc');
        expect(unlisted.status).toBe(200);
    });

    it('400s an unrecognised dir — the route schema rejects it before the handler', async () => {
        const res = await app().request('/users?sort=name&dir=sideways');
        expect(res.status).toBe(400);
    });

    it('403s without users:read', async () => {
        const res = await app(roleWith([])).request('/users');
        expect(res.status).toBe(403);
    });
});

describe('GET /users/:id', () => {
    it('returns { data: user }', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app().request(`/users/${user.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: User };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(user.id);
        expect(body.data.email).toBe('a@test.dev');
    });

    it('404s an unknown id', async () => {
        const res = await app().request('/users/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("User 'nope' not found");
    });

    it('403s a role without users:read reading someone else', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app(roleWith([])).request(`/users/${user.id}`);
        expect(res.status).toBe(403);
    });

    it('allows self-access without users:read', async () => {
        const self = await makeUser('self@test.dev', 'Self');
        const res = await app(roleWith([]), self).request(`/users/${self.id}`);
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: User }).data.id).toBe(self.id);
    });
});

describe('POST /users', () => {
    // Create stamps `created_by`/`updated_by` with the acting user, so the row
    // has to exist or the foreign key fails.
    beforeEach(async () => {
        await seedTestUser(db);
    });

    it('creates and returns { data: user } with 201', async () => {
        const res = await app().request('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'new@test.dev', name: 'New' }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as { data: User };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.email).toBe('new@test.dev');
        expect(body.data.name).toBe('New');
        expect(body.data.id).toBeTruthy();
    });

    it('carries role and fields through', async () => {
        const res = await app().request('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'ed@test.dev',
                name: 'Ed',
                role: 'editor',
                fields: { bio: 'hello' },
            }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as {
            data: { role: string; fields: Record<string, unknown> };
        };
        expect(body.data.role).toBe('editor');
        expect(body.data.fields['bio']).toBe('hello');
    });

    it('422s an invalid email', async () => {
        const res = await app().request('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'not-an-email', name: 'X' }),
        });
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { code: string; details: { fields: Record<string, string[]> } };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details.fields['email']).toBeDefined();
    });

    it('403s without users:create', async () => {
        const res = await app(roleWith(['users:read'])).request('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'x@test.dev', name: 'X' }),
        });
        expect(res.status).toBe(403);
    });
});

describe('PUT /users/:id', () => {
    it('updates and returns { data: user }', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app().request(`/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Annabel' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: User };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.name).toBe('Annabel');
    });

    it('403s a role without users:update editing someone else', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app(roleWith([])).request(`/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Nope' }),
        });
        expect(res.status).toBe(403);
    });

    it('allows self-edit without users:update', async () => {
        const self = await makeUser('self@test.dev', 'Self');
        const res = await app(roleWith([]), self).request(`/users/${self.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Myself' }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: User }).data.name).toBe('Myself');
    });

    it('403s a self-edit that changes role', async () => {
        const self = await makeUser('self@test.dev', 'Self', 'editor');
        const res = await app(roleWith([]), self).request(`/users/${self.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' }),
        });
        expect(res.status).toBe(403);
    });

    it('422s an invalid body', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app().request(`/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'nope' }),
        });
        expect(res.status).toBe(422);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'VALIDATION_FAILED'
        );
    });

    it('400s demoting the last administrator', async () => {
        const onlyAdmin = await makeUser('admin@test.dev', 'Admin', 'admin');
        const res = await app().request(`/users/${onlyAdmin.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'editor' }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
        expect(body.error.message).toBe('Cannot remove the last administrator');
    });

    it('allows demoting an admin when a second one exists', async () => {
        const first = await makeUser('admin1@test.dev', 'Admin One', 'admin');
        await makeUser('admin2@test.dev', 'Admin Two', 'admin');
        const res = await app().request(`/users/${first.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'editor' }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: User }).data.role).toBe('editor');
    });
});

describe('DELETE /users/:id', () => {
    it('returns { success: true }', async () => {
        const user = await makeUser('a@test.dev', 'Ann', 'editor');
        const res = await app().request(`/users/${user.id}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(await usersService.get({ id: user.id })).toBeNull();
    });

    // A role-less create takes `DEFAULT_ROLE_SLUG` from the create schema, not
    // `admin`, so it does not count toward the last-admin guard.
    it('deletes a user created without a role — the default is not admin', async () => {
        const user = await makeUser('b@test.dev', 'Bob');
        expect(user.role).toBe(DEFAULT_ROLE_SLUG);
        expect(user.role).not.toBe('admin');

        const res = await app().request(`/users/${user.id}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
    });

    it('403s without users:delete', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app(roleWith(['users:read'])).request(`/users/${user.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(403);
    });

    it('400s deleting the last administrator', async () => {
        const onlyAdmin = await makeUser('admin@test.dev', 'Admin', 'admin');
        const res = await app().request(`/users/${onlyAdmin.id}`, { method: 'DELETE' });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { message: string } };
        expect(body.error.message).toBe('Cannot delete the last administrator');
    });

    it('allows deleting an admin when a second one exists', async () => {
        const first = await makeUser('admin1@test.dev', 'Admin One', 'admin');
        await makeUser('admin2@test.dev', 'Admin Two', 'admin');
        const res = await app().request(`/users/${first.id}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
    });
});

describe('GET /users/:id/versions', () => {
    it('returns { data: versions } for the addressed locale', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({ id: user.id, data: { fields: { bio: 'second' } } });

        const res = await app().request(`/users/${user.id}/versions`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: UserVersion[] };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]?.userId).toBe(user.id);
        expect(body.data[0]?.locale).toBe('en');
    });

    it('403s without users:read', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app(roleWith([])).request(`/users/${user.id}/versions`);
        expect(res.status).toBe(403);
    });

    it('404s an unknown id', async () => {
        const res = await app().request('/users/nope/versions');
        expect(res.status).toBe(404);
    });
});

describe('POST /users/:id/versions/:versionId/restore', () => {
    // The restore snapshots the state it overwrites, crediting the acting user,
    // so that row has to exist or the foreign key fails.
    beforeEach(async () => {
        await seedTestUser(db);
    });

    it('restores and returns { data: user }', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({ id: user.id, data: { fields: { bio: 'first' } } });
        await usersService.update({ id: user.id, data: { fields: { bio: 'second' } } });
        const [version] = await usersService.versions({ id: user.id });
        if (!version) throw new Error('expected a version');

        const res = await app().request(
            `/users/${user.id}/versions/${version.id}/restore`,
            { method: 'POST' }
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: User };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.fields['bio']).toBe('first');
    });

    it('403s without users:update', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app(roleWith(['users:read'])).request(
            `/users/${user.id}/versions/anything/restore`,
            { method: 'POST' }
        );
        expect(res.status).toBe(403);
    });
});
