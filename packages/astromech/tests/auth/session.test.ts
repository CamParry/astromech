/**
 * `getSession` against a real database and a real Better Auth session. A
 * sign-in mints the session, its cookie comes back in on the request headers,
 * and resolution turns it into the stored user and the role the config
 * defines for them.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { signInTestUser } from '@tests/auth';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getAuth } from '@/auth/better-auth';
import { getSession } from '@/auth/session';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { log } from '@/utilities/log';

const usersService = currentServices.users;

let db: Kysely<DB>;

// One db for the file. `createTestDb()` clears the Better Auth instance an
// earlier file built, so `getAuth()` builds against this one.
beforeAll(async () => {
    db = await createTestDb();
    setupTestConfig(makeTestConfig());
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function setStoredRole(id: string, role: string): Promise<void> {
    await db.updateTable('users').set({ role }).where('id', '=', id).execute();
}

describe('getSession', () => {
    it('resolves null when the request carries no session cookie', async () => {
        expect(await getSession(new Headers())).toBeNull();
    });

    it('resolves the signed-in user with the default role', async () => {
        const { id, headers } = await signInTestUser(db, 'default@test.dev');

        const resolved = await getSession(headers);

        expect(resolved?.user.id).toBe(id);
        expect(resolved?.user.email).toBe('default@test.dev');
        expect(resolved?.role.slug).toBe(DEFAULT_ROLE_SLUG);
        expect(resolved?.session.userId).toBe(id);
    });

    it('resolves the role the user row holds now, not the one it was created with', async () => {
        const { id, headers } = await signInTestUser(db, 'promoted@test.dev');
        await setStoredRole(id, 'admin');

        const resolved = await getSession(headers);

        expect(resolved?.user.id).toBe(id);
        expect(resolved?.role).toMatchObject({ slug: 'admin', permissions: ['*'] });
    });

    it('resolves null once the user is deleted', async () => {
        const { id, headers } = await signInTestUser(db, 'deleted@test.dev');
        expect(await getSession(headers)).not.toBeNull();

        await usersService.delete({ id });

        expect(await getSession(headers)).toBeNull();
    });

    it('refuses a role the config does not define and logs a warning', async () => {
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
        const { id, headers } = await signInTestUser(db, 'retired@test.dev');
        await setStoredRole(id, 'retired');

        // Better Auth still accepts the session, so the refusal is the role check.
        expect(await getAuth().api.getSession({ headers })).not.toBeNull();
        expect(await getSession(headers)).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toContain(`User ${id} holds role "retired"`);
    });

    it.each([
        ['the trusted address', '203.0.113.5', '203.0.113.5'],
        ['no address', undefined, null],
    ])(
        'hands Better Auth %s, never the private header the client sent',
        async (_label, clientAddress, expected) => {
            const { headers } = await signInTestUser(
                db,
                `${crypto.randomUUID()}@test.dev`
            );
            headers.set('x-astromech-client-address', '198.51.100.66');
            const betterAuthGetSession = vi.spyOn(getAuth().api, 'getSession');

            await getSession(headers, clientAddress);

            const seen = betterAuthGetSession.mock.calls[0]?.[0]?.headers;
            expect(new Headers(seen).get('x-astromech-client-address')).toBe(expected);
        }
    );
});
