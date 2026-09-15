/**
 * `getSession` against a real database and a real Better Auth session. A
 * signup mints the session, its cookie comes back in on the request headers,
 * and resolution turns it into the stored user and the role the config
 * defines for them.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { usersService } from '@/app-context/services';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { getAuth } from '@/users/auth';
import { getSession } from '@/users/session';
import { log } from '@/utilities/log';

let db: Kysely<DB>;

// One db for the file: `getAuth()` builds its Kysely instance on first ask and
// keeps it in the registry slot, so a per-test db would leave it reading the
// previous one. The slot is cleared first so no earlier build is reused.
beforeAll(async () => {
    delete globalThis.__astromech?.auth;
    db = await createTestDb();
    setupTestConfig(makeTestConfig());
});

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * Sign a new user up through Better Auth. Returns their id and the headers a
 * browser sends on its next request, which carry the cookies the signup set.
 */
async function signUp(email: string): Promise<{ id: string; headers: Headers }> {
    const response = await getAuth().api.signUpEmail({
        body: { email, password: 'password123', name: 'Session User' },
        asResponse: true,
    });
    const cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(';', 1)[0])
        .join('; ');
    const body = (await response.json()) as { user: { id: string } };
    return { id: body.user.id, headers: new Headers({ cookie }) };
}

async function setStoredRole(id: string, role: string): Promise<void> {
    await db.updateTable('users').set({ role }).where('id', '=', id).execute();
}

describe('getSession', () => {
    it('resolves null when the request carries no session cookie', async () => {
        expect(await getSession(new Headers())).toBeNull();
    });

    it('resolves the signed-in user with the default role', async () => {
        const { id, headers } = await signUp('default@test.dev');

        const resolved = await getSession(headers);

        expect(resolved?.user.id).toBe(id);
        expect(resolved?.user.email).toBe('default@test.dev');
        expect(resolved?.role.slug).toBe(DEFAULT_ROLE_SLUG);
        expect(resolved?.session.userId).toBe(id);
    });

    it('resolves the role the user row holds now, not the one signup wrote', async () => {
        const { id, headers } = await signUp('promoted@test.dev');
        await setStoredRole(id, 'admin');

        const resolved = await getSession(headers);

        expect(resolved?.user.id).toBe(id);
        expect(resolved?.role).toMatchObject({ slug: 'admin', permissions: ['*'] });
    });

    it('resolves null once the user is deleted', async () => {
        const { id, headers } = await signUp('deleted@test.dev');
        expect(await getSession(headers)).not.toBeNull();

        await usersService.delete({ id });

        expect(await getSession(headers)).toBeNull();
    });

    it('refuses a role the config does not define and logs a warning', async () => {
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
        const { id, headers } = await signUp('retired@test.dev');
        await setStoredRole(id, 'retired');

        // Better Auth still accepts the session, so the refusal is the role check.
        expect(await getAuth().api.getSession({ headers })).not.toBeNull();
        expect(await getSession(headers)).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toContain(`User ${id} holds role "retired"`);
    });
});
