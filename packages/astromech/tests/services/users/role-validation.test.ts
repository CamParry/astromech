/**
 * A role slug the config does not define is refused on the way in, and refused
 * again on the way out.
 *
 * `role` is a bare string in `users/schema.ts` and a bare `text` column, so
 * neither zod nor the DDL constrains it to the configured roles. These pin the
 * two places that do: the write operations, and session resolution for a row
 * written before a config edit removed the role it names.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/errors/validation';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { getAuth } from '@/users/auth';
import { usersService } from '@/users/service';
import { getSession } from '@/users/session';

let db: Kysely<DB>;

// `getAuth()` memoises its Kysely instance into the registry slot on first ask,
// so the slot is cleared and one db is shared for the file, as in the other
// auth suites.
beforeAll(async () => {
    delete globalThis.__astromech?.auth;
    db = await createTestDb();
    setupTestConfig();
});

describe('usersService.create', () => {
    it('rejects a role the config does not define', async () => {
        await expect(
            usersService.create({
                data: { email: 'typo@test.dev', name: 'Typo', role: 'admni' },
            })
        ).rejects.toThrow(ValidationError);
    });

    it('does not write the row it rejected', async () => {
        await usersService
            .create({
                data: { email: 'rejected@test.dev', name: 'Rejected', role: 'nope' },
            })
            .catch(() => undefined);

        const row = await db
            .selectFrom('users')
            .select('id')
            .where('email', '=', 'rejected@test.dev')
            .executeTakeFirst();
        expect(row).toBeUndefined();
    });

    it('accepts a configured role', async () => {
        const user = await usersService.create({
            data: { email: 'fine@test.dev', name: 'Fine', role: 'admin' },
        });
        expect(user.role).toBe('admin');
    });
});

describe('usersService.update', () => {
    it('rejects a role the config does not define', async () => {
        const user = await createTestUser(db, { email: 'held@test.dev' });
        await expect(
            usersService.update({ id: user.id, data: { role: 'reviewer' } })
        ).rejects.toThrow(ValidationError);

        const after = await usersService.get({ id: user.id });
        expect(after?.role).toBe(DEFAULT_ROLE_SLUG);
    });

    it('leaves the role alone when the update names no role', async () => {
        const user = await createTestUser(db, { email: 'renamed@test.dev' });
        const updated = await usersService.update({
            id: user.id,
            data: { name: 'Renamed' },
        });
        expect(updated.role).toBe(DEFAULT_ROLE_SLUG);
    });
});

describe('getSession', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * The config-edit case end to end: the row is valid, was written when the
     * role existed, and the config no longer defines it. The session is refused
     * rather than resolved, because the alternative is granting a role nobody
     * chose.
     */
    it('refuses a session whose stored role is no longer configured', async () => {
        const response = await getAuth().api.signUpEmail({
            body: { email: 'stale@test.dev', password: 'password123', name: 'Stale' },
            asResponse: true,
        });
        const cookie = response.headers.get('set-cookie');
        expect(cookie).toBeTruthy();
        const headers = new Headers({ cookie: cookie ?? '' });

        expect(await getSession(headers)).not.toBeNull();

        await db
            .updateTable('users')
            .set({ role: 'reviewer' })
            .where('email', '=', 'stale@test.dev')
            .execute();

        const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await getSession(headers)).toBeNull();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('reviewer'),
            ...([] as unknown[])
        );
    });
});
