/**
 * better-auth signup writes `role_slug` itself.
 *
 * Signup inserts through better-auth's own Kysely instance, bypassing our codec
 * and storage, so the role it writes comes from `user.additionalFields` in
 * `users/auth.ts`. The column has no SQL default to fall back on.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { auth } from '@/users/auth';
import { DEFAULT_ROLE_SLUG } from '@/permissions/index';
import type { DB } from '@/database/types';

let db: Kysely<DB>;

// One db for the file: `auth` builds its Kysely instance once, on first access,
// and holds it — a per-test db would leave it writing to the previous one.
beforeAll(async () => {
    db = await createTestDb();
    setupTestConfig();
});

describe('better-auth email signup', () => {
    it('inserts the default role rather than relying on a column default', async () => {
        await auth.api.signUpEmail({
            body: { email: 'signup@test.dev', password: 'password123', name: 'Signup' },
        });

        const row = await db
            .selectFrom('users')
            .select('roleSlug')
            .where('email', '=', 'signup@test.dev')
            .executeTakeFirstOrThrow();

        expect(row.roleSlug).toBe(DEFAULT_ROLE_SLUG);
        expect(row.roleSlug).not.toBe('admin');
    });

    // `input: false` makes better-auth substitute the declared default for
    // whatever the body sent, so a signup cannot name its own role. The cast is
    // the point: the signup body type already has no `roleSlug`, and this is
    // what an untyped HTTP caller sending one gets.
    it('ignores a role named by the signup body', async () => {
        const body = {
            email: 'escalate@test.dev',
            password: 'password123',
            name: 'Escalate',
            roleSlug: 'admin',
        };
        type SignUpArgs = NonNullable<Parameters<typeof auth.api.signUpEmail>[0]>;
        await auth.api.signUpEmail({ body } as unknown as SignUpArgs);

        const row = await db
            .selectFrom('users')
            .select('roleSlug')
            .where('email', '=', 'escalate@test.dev')
            .executeTakeFirstOrThrow();

        expect(row.roleSlug).toBe(DEFAULT_ROLE_SLUG);
    });
});
