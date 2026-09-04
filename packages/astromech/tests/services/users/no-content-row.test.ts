/**
 * A `users` row with no content row still reads. better-auth mints the account
 * row outside Astromech's write path, so a provider that never runs the content
 * hook must not lock the user out of their own session; the first `update` with
 * `fields` is what creates the row.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeWith } from '@/database/codec';
import { usersTable } from '@/database/tables';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { createUserRepository } from '@/users/repository';
import { usersService as api } from '@/users/service';

let db: Kysely<DB>;
let id: string;

/** The account row alone — what better-auth's insert leaves behind. */
async function insertAccountRow(): Promise<string> {
    const row = await db
        .insertInto('users')
        .values(
            encodeWith(usersTable, {
                email: 'noprofile@test.dev',
                name: 'No Profile',
                role: DEFAULT_ROLE_SLUG,
            })
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    return String(row.id);
}

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    id = await insertAccountRow();
});

describe('a user with no content row', () => {
    it('reads through the service as empty content', async () => {
        const user = await api.get({ id });
        expect(user?.name).toBe('No Profile');
        expect(user?.fields).toEqual({});
        expect(user?.locale).toBe('en');
        expect(user?.locales).toEqual([]);
    });

    it('reads through the repository the session resolves with', async () => {
        const row = await createUserRepository().get(id);
        expect(row?.email).toBe('noprofile@test.dev');
        expect(row?.fields).toEqual({});
        expect(row?.locales).toEqual([]);
    });

    it('gets a default-locale row from the first fields update', async () => {
        const updated = await api.update({ id, data: { fields: { bio: 'hello' } } });

        expect(updated.fields['bio']).toBe('hello');
        expect(updated.locale).toBe('en');
        expect(updated.locales).toEqual(['en']);
    });
});
