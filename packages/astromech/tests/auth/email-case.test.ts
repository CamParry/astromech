/**
 * A user's email is compared without regard to case, as Better Auth compares
 * it: an account created with capitals, by first-run setup or by `users.create`,
 * signs in with the email in any casing.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { adminRole } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '@/transport/http/app';
import { usersRouter } from '@/transport/http/routes/users';

/** The composed HTTP app, typed as `createHttpApp` builds it. */
type HttpApp = ReturnType<typeof createHttpApp>;

const PASSWORD = 'password123';
const CASINGS = ['Mixed.Case@Test.dev', 'mixed.case@test.dev', 'MIXED.CASE@TEST.DEV'];

let db: Kysely<DB>;
let app: HttpApp;
let api: string;
let attempts = 0;

beforeEach(async () => {
    attempts = 0;
    db = await createTestDb();
    const resolved = setupTestConfig({
        ...makeTestConfig(),
        security: { trustProxy: true },
    });
    api = `${resolved.basePath}/api`;
    app = createHttpApp(resolved);
});

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(`${api}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

/** Sign in from an address of its own, so the per-address limit never answers first. */
async function signIn(email: string): Promise<Response> {
    attempts += 1;
    return await postJson(
        '/auth/sign-in/email',
        { email, password: PASSWORD },
        { 'x-forwarded-for': `203.0.113.${attempts}` }
    );
}

/** The status and stored email of a sign-in as each casing of `CASINGS`. */
async function signInEachCasing(): Promise<[number, string | undefined][]> {
    const results: [number, string | undefined][] = [];
    for (const email of CASINGS) {
        const res = await signIn(email);
        const body = (await res.json()) as { user?: { email: string } };
        results.push([res.status, body.user?.email]);
    }
    return results;
}

// Each sign-in hashes a password, which is slow when the suite shares a busy machine.
describe('email case', { timeout: 60_000 }, () => {
    it('signs in the first admin with the email in any casing', async () => {
        const res = await postJson('/setup', {
            name: 'First',
            email: CASINGS[0],
            password: PASSWORD,
        });
        expect(res.status).toBe(200);

        expect(await signInEachCasing()).toEqual(
            CASINGS.map(() => [200, 'mixed.case@test.dev'])
        );
    });

    it('signs in a user created through POST /users with the email in any casing', async () => {
        // The create stamps `created_by` with the acting user, so the row has to exist.
        await seedTestUser(db);
        const res = await mountRouter('/users', usersRouter, adminRole).request(
            '/users',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Mixed',
                    email: CASINGS[0],
                    password: PASSWORD,
                }),
            }
        );
        expect(res.status).toBe(201);

        expect(await signInEachCasing()).toEqual(
            CASINGS.map(() => [200, 'mixed.case@test.dev'])
        );
    });
});
