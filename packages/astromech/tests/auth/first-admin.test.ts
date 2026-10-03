/**
 * What first-run setup writes: the first admin, its credential account and its
 * content row, with one conditional insert as the gate. Better Auth's own
 * sign-up is refused whatever the database holds. `users.create` writes a
 * credential account the same way when given a password.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { invalid } from '@tests/fixtures';
import {
    createTestDb,
    failWritesTo,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getAuth } from '@/auth/better-auth';
import { createFirstAdmin } from '@/auth/setup';
import { getDefaultContentLocale } from '@/config/content-locale';
import { decodeWith } from '@/database/codec';
import { mediaRepository } from '@/media/repository';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { userRepository } from '@/users/repository';
import { usersTable } from '@/users/tables';

const usersService = currentServices.users;

let db: Kysely<DB>;

const ADMIN = { name: 'First Admin', email: 'first@test.dev', password: 'password123' };

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

type SignUpEmail = ReturnType<typeof getAuth>['api']['signUpEmail'];
type SignUpArgs = NonNullable<Parameters<SignUpEmail>[0]>;
type Refusal = { statusCode?: number; body?: { code?: string } } | null;

/** A sign-up through Better Auth for `email`, with the other fields filled in. */
function signUpArgs(email: string): SignUpArgs {
    return { body: { email, password: 'password123', name: 'Signup' } };
}

/** The error a Better Auth sign-up rejects with, or null if it succeeds. */
function refusal(args: SignUpArgs): Promise<Refusal> {
    return getAuth()
        .api.signUpEmail(args)
        .then(
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

async function rowCount(table: 'users' | 'accounts' | 'user_content'): Promise<number> {
    const { rows } = await sql<{ count: number }>`
        SELECT count(*) AS count FROM ${sql.table(table)}
    `.execute(db);
    return Number(rows[0]?.count);
}

describe('first-run setup', () => {
    it('creates the first user as an admin', async () => {
        expect(await createFirstAdmin(ADMIN)).toBe('created');

        expect(await roleOf(ADMIN.email)).toBe('admin');
    });

    it('writes a credential account the password signs in through', async () => {
        await createFirstAdmin(ADMIN);

        const signedIn = await getAuth().api.signInEmail({
            body: { email: ADMIN.email, password: ADMIN.password },
        });

        expect(signedIn.user.email).toBe(ADMIN.email);
    });

    it('writes the default-locale content row', async () => {
        await createFirstAdmin(ADMIN);

        const user = await db
            .selectFrom('users')
            .select('id')
            .where('email', '=', ADMIN.email)
            .executeTakeFirstOrThrow();
        const rows = await db
            .selectFrom('userContent')
            .select(['locale', 'fields'])
            .where('userId', '=', user.id)
            .execute();

        expect(rows).toHaveLength(1);
        expect(rows[0]?.locale).toBe(getDefaultContentLocale());
    });

    // The same writes `users.create` makes: one insert per row, no update.
    it('writes the first admin without updating the users row it inserted', async () => {
        await failWritesTo(usersTable, 'update');

        expect(await createFirstAdmin(ADMIN)).toBe('created');
        expect(await roleOf(ADMIN.email)).toBe('admin');
    });

    it('fills the default of a user field', async () => {
        setupTestConfig({
            ...makeTestConfig(),
            users: {
                fields: [
                    { name: 'team', type: 'text', label: 'Team', defaultValue: 'Ops' },
                ],
            },
        });

        await createFirstAdmin(ADMIN);

        const [admin] = (await usersService.query({ limit: 'all' })).data;
        expect(admin?.fields).toEqual({ team: 'Ops' });
    });

    it('refuses setup, writing nothing, while a required user field has no default', async () => {
        setupTestConfig({
            ...makeTestConfig(),
            users: {
                fields: [{ name: 'team', type: 'text', label: 'Team', required: true }],
            },
        });

        await expect(createFirstAdmin(ADMIN)).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { team: ['This field is required'] },
        });
        expect(await rowCount('users')).toBe(0);
        expect(await rowCount('accounts')).toBe(0);
    });

    it('stores the user fields sent with the first admin', async () => {
        setupTestConfig({
            ...makeTestConfig(),
            users: {
                fields: [{ name: 'team', type: 'text', label: 'Team', required: true }],
            },
        });

        expect(
            await createFirstAdmin({ ...ADMIN, data: { fields: { team: 'Ops' } } })
        ).toBe('created');

        const [admin] = (await usersService.query({ limit: 'all' })).data;
        expect(admin?.fields).toEqual({ team: 'Ops' });
    });

    it('indexes the references the first admin holds', async () => {
        const media = await mediaRepository.create(
            { filename: 'avatar.png', mimeType: 'image/png', size: 1 },
            {}
        );
        setupTestConfig({
            ...makeTestConfig(),
            users: { fields: [{ name: 'avatar', type: 'media', label: 'Avatar' }] },
        });

        await createFirstAdmin({ ...ADMIN, data: { fields: { avatar: media.id } } });

        const usage = await currentServices.media.usedBy({ id: media.id });
        expect(usage.map((row) => [row.sourceKind, row.sourceTitle])).toEqual([
            ['user', ADMIN.name],
        ]);
    });

    // Checked before the fields, so an installed site answers the same refusal
    // whatever its user fields require.
    it('answers closed once a user exists, even while a required user field has no value', async () => {
        await createFirstAdmin(ADMIN);
        setupTestConfig({
            ...makeTestConfig(),
            users: {
                fields: [{ name: 'team', type: 'text', label: 'Team', required: true }],
            },
        });

        expect(await createFirstAdmin({ ...ADMIN, email: 'second@test.dev' })).toBe(
            'closed'
        );
        expect(await rowCount('users')).toBe(1);
    });

    it('answers closed for a second setup, writing no user or account row', async () => {
        await createFirstAdmin(ADMIN);

        const second = await createFirstAdmin({
            name: 'Second',
            email: 'second@test.dev',
            password: 'password123',
        });

        expect(second).toBe('closed');
        expect(await roleOf('second@test.dev')).toBeUndefined();
        expect(await rowCount('users')).toBe(1);
        expect(await rowCount('accounts')).toBe(1);
    });

    // The conditional insert is the gate, so the two calls need no
    // coordination: whichever statement runs second finds an occupied table and
    // inserts nothing.
    it('creates one user for two setups running at once', async () => {
        const results = await Promise.all([
            createFirstAdmin({ ...ADMIN, email: 'racer-a@test.dev' }),
            createFirstAdmin({ ...ADMIN, email: 'racer-b@test.dev' }),
        ]);

        expect([...results].sort()).toEqual(['closed', 'created']);
        const roles = [
            await roleOf('racer-a@test.dev'),
            await roleOf('racer-b@test.dev'),
        ];
        expect(roles.filter((role) => role === 'admin')).toHaveLength(1);
        expect(roles.filter((role) => role === undefined)).toHaveLength(1);
        expect(await rowCount('users')).toBe(1);
        expect(await rowCount('accounts')).toBe(1);
        expect(await rowCount('user_content')).toBe(1);
    });

    it('refuses a Better Auth sign-up on an empty install', async () => {
        const error = await refusal(signUpArgs('signup@test.dev'));

        expect(error?.statusCode).toBe(403);
        expect(error?.body?.code).toBe('SIGN_UP_CLOSED');
        expect(await rowCount('users')).toBe(0);
        expect(await rowCount('accounts')).toBe(0);
    });

    it('refuses a Better Auth sign-up once a user exists', async () => {
        await createFirstAdmin(ADMIN);

        // `role` reaches the body as an untyped HTTP caller's field would; the
        // body's type has no `role`.
        const { body } = signUpArgs('escalate@test.dev');
        const error = await refusal(
            invalid<SignUpArgs>({ body: { ...body, role: 'admin' } })
        );

        expect(error?.statusCode).toBe(403);
        expect(error?.body?.code).toBe('SIGN_UP_CLOSED');
        expect(await roleOf('escalate@test.dev')).toBeUndefined();
        expect(await rowCount('users')).toBe(1);
        expect(await rowCount('accounts')).toBe(1);
    });

    // The users service writes through its own repository, not through Better Auth.
    it('leaves the users service able to create accounts once setup is done', async () => {
        await createFirstAdmin(ADMIN);

        await usersService.create({
            data: { email: 'invited@test.dev', name: 'Invited', role: DEFAULT_ROLE_SLUG },
        });

        expect(await roleOf('invited@test.dev')).toBe(DEFAULT_ROLE_SLUG);
    });

    // The descriptor is generated from, and generates, both the DDL and the
    // codec, so what setup's own INSERT puts in each column is what the
    // descriptor has to describe. This is the check that they agree.
    it('writes a row the descriptor codec reads back', async () => {
        const before = Date.now();
        await createFirstAdmin(ADMIN);

        const raw = await db
            .selectFrom('users')
            .selectAll()
            .where('email', '=', ADMIN.email)
            .executeTakeFirst();
        const user = decodeWith(usersTable, raw);

        expect(user).toBeDefined();
        expect(user?.id).toBe(raw?.id);
        expect(user?.email).toBe(ADMIN.email);
        expect(user?.name).toBe(ADMIN.name);
        // The id setup mints, in the format `col.id({ format: 'uuid' })` states.
        expect(user?.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        expect(user?.emailVerified).toBe(true);
        expect(user?.role).toBe('admin');
        expect(user?.createdAt).toBeInstanceOf(Date);
        expect(user?.createdAt.getTime()).not.toBeNaN();
        expect(Math.abs((user?.createdAt.getTime() ?? 0) - before)).toBeLessThan(60_000);
        expect(Math.abs((user?.updatedAt.getTime() ?? 0) - before)).toBeLessThan(60_000);
    });

    /**
     * Both writers of `users` produce the same cell: setup's conditional insert
     * and the user repository each write ISO-8601 TEXT. The descriptor declares
     * that format, so this is what would fail first if either side moved.
     */
    it('writes ISO-8601 TEXT timestamps, the same format our own writes store', async () => {
        await createFirstAdmin({ ...ADMIN, email: 'stamp@test.dev' });
        await userRepository.create(
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

describe('users.create with a password', () => {
    it('writes a credential account the password signs in through', async () => {
        await usersService.create({
            data: { name: 'Later', email: 'later@test.dev', password: 'password123' },
        });

        const signedIn = await getAuth().api.signInEmail({
            body: { email: 'later@test.dev', password: 'password123' },
        });
        expect(signedIn.user.email).toBe('later@test.dev');
    });

    it('writes no credential account without one', async () => {
        await usersService.create({ data: { name: 'Later', email: 'later@test.dev' } });

        expect(await rowCount('accounts')).toBe(0);
    });

    it('refuses a password under eight characters, writing nothing', async () => {
        await expect(
            usersService.create({
                data: { name: 'Later', email: 'later@test.dev', password: 'short' },
            })
        ).rejects.toMatchObject({ name: 'ValidationError' });
        expect(await rowCount('users')).toBe(0);
    });
});
