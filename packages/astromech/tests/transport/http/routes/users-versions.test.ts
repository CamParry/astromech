/**
 * The locale and the versions the users routes carry.
 *
 * The service tests cover the fallback read, the translation copy and the
 * version sequence; these assert the wire reaches them: `?locale=` on the
 * read, the update, the list and both version routes, the 404s an unknown id
 * and a foreign version give, and the grant a restore demands.
 */

import type { User, UserVersion } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, roleWith, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { usersRouter } from '@/transport/http/routes/users';
import { usersService } from '@/users/service';
import { makeTranslatableUsersConfig } from '../../../services/users/users-config';

/** The users router mounted in isolation, acting as `role`. */
function app(role = adminRole) {
    return mountRouter('/users', usersRouter, role);
}

/** Create a user through the Local API (no permission checks). */
async function makeUser(email: string, name: string): Promise<User> {
    return usersService.create({ data: { email, name } });
}

/** The `data` envelope of a 200, or a failure naming the status instead. */
async function data<T>(res: Response): Promise<T> {
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: T }).data;
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeTranslatableUsersConfig());
    await seedTestUser(db);
});

describe('GET /users/:id', () => {
    it('falls back to the default locale for an untranslated user', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const item = await data<{ locale: string }>(
            await app().request(`/users/${user.id}?locale=fr`)
        );
        expect(item.locale).toBe('en');
    });
});

describe('PUT /users/:id', () => {
    it('creates the translation the locale on the URL names', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        const res = await app().request(`/users/${user.id}?locale=fr`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { bio: 'bio français' } }),
        });

        const item = await data<{ locale: string; fields: { bio: string } }>(res);
        expect(item.locale).toBe('fr');
        expect(item.fields.bio).toBe('bio français');
        // The English row is untouched.
        expect((await usersService.get({ id: user.id }))?.fields['bio']).toBeUndefined();
    });
});

describe('GET /users', () => {
    it('lists with the named locale’s content where it has one', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'bio français' } },
        });

        const body = (await (await app().request('/users?locale=fr')).json()) as {
            data: { id: string; locale: string }[];
        };
        const found = body.data.find((row) => row.id === user.id);
        expect(found?.locale).toBe('fr');
    });
});

describe('GET /users/:id/versions', () => {
    it('lists the versions of the locale it names', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'un' } },
        });
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'deux' } },
        });

        const versions = await data<UserVersion[]>(
            await app().request(`/users/${user.id}/versions?locale=fr`)
        );
        expect(versions).toHaveLength(1);
        expect(versions[0]?.fields?.['bio']).toBe('un');
        expect(versions[0]?.locale).toBe('fr');

        // The default locale has a sequence of its own, and it is empty.
        expect(await data(await app().request(`/users/${user.id}/versions`))).toEqual([]);
    });

    it('404s an unknown id', async () => {
        expect((await app().request('/users/nope/versions')).status).toBe(404);
    });
});

describe('POST /users/:id/versions/:versionId/restore', () => {
    it('restores the named version and returns the user', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'un' } },
        });
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'deux' } },
        });
        const [version] = await usersService.versions({ id: user.id, locale: 'fr' });

        const item = await data<{ locale: string; fields: { bio: string } }>(
            await app().request(
                `/users/${user.id}/versions/${version?.id ?? ''}/restore?locale=fr`,
                { method: 'POST' }
            )
        );
        expect(item.fields.bio).toBe('un');
        expect(item.locale).toBe('fr');
    });

    it('404s a version belonging to another locale', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'un' } },
        });
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'deux' } },
        });
        const [version] = await usersService.versions({ id: user.id, locale: 'fr' });

        const res = await app().request(
            `/users/${user.id}/versions/${version?.id ?? ''}/restore`,
            { method: 'POST' }
        );
        expect(res.status).toBe(404);
    });

    it('403s a role holding users:read alone', async () => {
        const user = await makeUser('a@test.dev', 'Ann');
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'un' } },
        });
        await usersService.update({
            id: user.id,
            locale: 'fr',
            data: { fields: { bio: 'deux' } },
        });
        const [version] = await usersService.versions({ id: user.id, locale: 'fr' });
        const reader = roleWith(['users:read']);

        expect(
            (await app(reader).request(`/users/${user.id}/versions?locale=fr`)).status
        ).toBe(200);
        expect(
            (
                await app(reader).request(
                    `/users/${user.id}/versions/${version?.id ?? ''}/restore?locale=fr`,
                    { method: 'POST' }
                )
            ).status
        ).toBe(403);
    });
});
