/**
 * What Better Auth's own sign-up writes: the first account gets `admin`, every
 * later sign-up is refused, and the row matches what the `users` descriptor says.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { usersService } from '@/app-context/services';
import { getDefaultContentLocale } from '@/config/content-locale';
import { decodeWith } from '@/database/codec';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { getAuth } from '@/users/auth';
import { createUserRepository } from '@/users/repository';
import { usersTable } from '@/users/tables';

let db: Kysely<DB>;

// `getAuth()` binds its Kysely instance to the database registered when it is
// first asked for, so the registry slot is cleared with each fresh database.
beforeEach(async () => {
    delete globalThis.__astromech?.auth;
    db = await createTestDb();
    setupTestConfig();
});

type SignUpEmail = ReturnType<typeof getAuth>['api']['signUpEmail'];
type SignUpArgs = NonNullable<Parameters<SignUpEmail>[0]>;
type Refusal = { statusCode?: number; body?: { code?: string } } | null;

/**
 * Sign up through Better Auth. `extra` reaches the body as an untyped HTTP
 * caller's fields would, which is why the body is cast: its type has no `role`.
 */
function signUp(email: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    const body = { email, password: 'password123', name: 'Signup', ...extra };
    return getAuth().api.signUpEmail({ body } as unknown as SignUpArgs);
}

/** The error a sign-up rejects with, or null if it succeeds. */
function refusal(email: string, extra: Record<string, unknown> = {}): Promise<Refusal> {
    return signUp(email, extra).then(
        () => null,
        (error: unknown) => error as Refusal
    );
}

async function roleOf(email: string): Promise<string | undefined> {
    const row = await db
        .selectFrom('users')
        .select('role')
        .where('email', '=', email)
        .executeTakeFirst();
    return row?.role;
}

async function rowCount(table: 'users' | 'accounts'): Promise<number> {
    const { rows } = await sql<{ count: number }>`
        SELECT count(*) AS count FROM ${sql.table(table)}
    `.execute(db);
    return Number(rows[0]?.count);
}

describe('better-auth email sign-up', () => {
    it('gives the first sign-up the admin role', async () => {
        await signUp('first@test.dev');

        expect(await roleOf('first@test.dev')).toBe('admin');
    });

    it('refuses a sign-up once a user exists, writing no user or account row', async () => {
        await signUp('first@test.dev');

        const error = await refusal('second@test.dev');

        expect(error?.statusCode).toBe(403);
        expect(error?.body?.code).toBe('SIGN_UP_CLOSED');
        expect(await roleOf('second@test.dev')).toBeUndefined();
        expect(await rowCount('users')).toBe(1);
        expect(await rowCount('accounts')).toBe(1);
    });

    it('gives the first sign-up admin whatever role the body names', async () => {
        await signUp('first@test.dev', { role: DEFAULT_ROLE_SLUG });

        expect(await roleOf('first@test.dev')).toBe('admin');
    });

    it('refuses a later sign-up whose body names admin', async () => {
        await signUp('first@test.dev');

        const error = await refusal('escalate@test.dev', { role: 'admin' });

        expect(error?.statusCode).toBe(403);
        expect(await roleOf('escalate@test.dev')).toBeUndefined();
    });

    // The users service writes through its own repository, not through Better Auth.
    it('leaves the users service able to create accounts once sign-up is closed', async () => {
        await signUp('first@test.dev');

        await usersService.create({
            data: { email: 'invited@test.dev', name: 'Invited', role: DEFAULT_ROLE_SLUG },
        });

        expect(await roleOf('invited@test.dev')).toBe(DEFAULT_ROLE_SLUG);
    });

    // better-auth's insert is not our write path, so the content row every
    // other create path writes comes from `databaseHooks.user.create.after`.
    it('writes the default-locale content row for the new user', async () => {
        await signUp('content@test.dev');

        const user = await db
            .selectFrom('users')
            .select('id')
            .where('email', '=', 'content@test.dev')
            .executeTakeFirstOrThrow();

        const rows = await db
            .selectFrom('userContent')
            .select(['locale', 'fields'])
            .where('userId', '=', user.id)
            .execute();

        expect(rows).toHaveLength(1);
        expect(rows[0]?.locale).toBe(getDefaultContentLocale());
    });

    // The descriptor is generated from, and generates, both the DDL and the
    // codec, so what better-auth's own INSERT puts in each column is what the
    // descriptor has to describe. This is the check that they agree.
    it('writes a row the descriptor codec reads back', async () => {
        const before = Date.now();
        await signUp('codec@test.dev');

        const raw = await db
            .selectFrom('users')
            .selectAll()
            .where('email', '=', 'codec@test.dev')
            .executeTakeFirst();
        const user = decodeWith(usersTable, raw);

        expect(user).toBeDefined();
        expect(user?.id).toBe(raw?.id);
        expect(user?.email).toBe('codec@test.dev');
        expect(user?.name).toBe('Signup');
        // The id is better-auth's own — 32 alphanumeric characters, not a uuid.
        // `col.id({ format: 'uuid' })` describes what OUR writes mint.
        expect(user?.id).toMatch(/^[A-Za-z0-9]{32}$/);
        expect(user?.emailVerified).toBe(false);
        expect(user?.role).toBe('admin');
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
        await signUp('stamp@test.dev');
        await createUserRepository().create(
            {
                email: 'ours@test.dev',
                name: 'Ours',
                role: DEFAULT_ROLE_SLUG,
            },
            { fields: {} }
        );

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
