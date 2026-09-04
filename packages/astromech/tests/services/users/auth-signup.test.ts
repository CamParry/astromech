/**
 * What better-auth's own signup writes into `users`.
 *
 * Signup inserts through better-auth's own Kysely instance, bypassing our codec
 * and repository, so the role it writes comes from `user.additionalFields` in
 * `users/auth.ts` (the column has no SQL default to fall back on) and the
 * timestamp format it writes is what the descriptor has to describe.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeWith } from '@/database/codec';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { getAuth } from '@/users/auth';
import { createUserRepository } from '@/users/repository';
import { usersTable } from '@/users/tables';

let db: Kysely<DB>;

// One db for the file: `getAuth()` builds its Kysely instance once, on first
// ask, and memoises it — a per-test db would leave it writing to the previous
// one. The registry slot is cleared first so no earlier build is reused.
beforeAll(async () => {
    delete globalThis.__astromech?.auth;
    db = await createTestDb();
    setupTestConfig();
});

describe('better-auth email signup', () => {
    it('inserts the default role rather than relying on a column default', async () => {
        await getAuth().api.signUpEmail({
            body: { email: 'signup@test.dev', password: 'password123', name: 'Signup' },
        });

        const row = await db
            .selectFrom('users')
            .select('role')
            .where('email', '=', 'signup@test.dev')
            .executeTakeFirstOrThrow();

        expect(row.role).toBe(DEFAULT_ROLE_SLUG);
        expect(row.role).not.toBe('admin');
    });

    // `input: false` makes better-auth substitute the declared default for
    // whatever the body sent, so a signup cannot name its own role. The cast is
    // the point: the signup body type already has no `role`, and this is
    // what an untyped HTTP caller sending one gets.
    it('ignores a role named by the signup body', async () => {
        const body = {
            email: 'escalate@test.dev',
            password: 'password123',
            name: 'Escalate',
            role: 'admin',
        };
        type SignUpEmail = ReturnType<typeof getAuth>['api']['signUpEmail'];
        type SignUpArgs = NonNullable<Parameters<SignUpEmail>[0]>;
        await getAuth().api.signUpEmail({ body } as unknown as SignUpArgs);

        const row = await db
            .selectFrom('users')
            .select('role')
            .where('email', '=', 'escalate@test.dev')
            .executeTakeFirstOrThrow();

        expect(row.role).toBe(DEFAULT_ROLE_SLUG);
    });

    // The descriptor is generated from, and generates, both the DDL and the
    // codec, so what better-auth's own INSERT puts in each column is what the
    // descriptor has to describe. This is the check that they agree.
    it('writes a row the descriptor codec reads back', async () => {
        const before = Date.now();
        await getAuth().api.signUpEmail({
            body: { email: 'codec@test.dev', password: 'password123', name: 'Codec' },
        });

        const raw = await db
            .selectFrom('users')
            .selectAll()
            .where('email', '=', 'codec@test.dev')
            .executeTakeFirst();
        const user = decodeWith(usersTable, raw);

        expect(user).toBeDefined();
        expect(user?.id).toBe(raw?.id);
        expect(user?.email).toBe('codec@test.dev');
        expect(user?.name).toBe('Codec');
        // The id is better-auth's own — 32 alphanumeric characters, not a uuid.
        // `col.id({ format: 'uuid' })` describes what OUR writes mint.
        expect(user?.id).toMatch(/^[A-Za-z0-9]{32}$/);
        expect(user?.emailVerified).toBe(false);
        expect(user?.role).toBe(DEFAULT_ROLE_SLUG);
        expect(user?.createdAt).toBeInstanceOf(Date);
        expect(user?.createdAt.getTime()).not.toBeNaN();
        expect(Math.abs((user?.createdAt.getTime() ?? 0) - before)).toBeLessThan(60_000);
        expect(Math.abs((user?.updatedAt.getTime() ?? 0) - before)).toBeLessThan(60_000);
    });

    /**
     * Both writers of `users` produce the same cell: better-auth's adapter and
     * our own repository each write ISO-8601 TEXT. The descriptor declares that
     * format, so this is what would fail first if either side moved.
     */
    it('writes ISO-8601 TEXT timestamps, the same format our own writes store', async () => {
        await getAuth().api.signUpEmail({
            body: { email: 'stamp@test.dev', password: 'password123', name: 'Stamp' },
        });
        await createUserRepository().create({
            email: 'ours@test.dev',
            name: 'Ours',
            role: DEFAULT_ROLE_SLUG,
        });

        const { rows } = await sql<{ email: string; kind: string; value: unknown }>`
            SELECT email, typeof(created_at) AS kind, created_at AS value
            FROM users WHERE email IN ('stamp@test.dev', 'ours@test.dev')
            ORDER BY email
        `.execute(db);

        expect(rows.map((r) => [r.email, r.kind])).toEqual([
            ['ours@test.dev', 'text'],
            ['stamp@test.dev', 'text'],
        ]);
        for (const row of rows) {
            expect(String(row.value)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(
                Math.abs(new Date(String(row.value)).getTime() - Date.now())
            ).toBeLessThan(60_000);
        }
    });

    it('decodes a missing row as undefined', async () => {
        const raw = await db
            .selectFrom('users')
            .selectAll()
            .where('email', '=', 'nobody@test.dev')
            .executeTakeFirst();

        expect(decodeWith(usersTable, raw)).toBeUndefined();
    });
});
