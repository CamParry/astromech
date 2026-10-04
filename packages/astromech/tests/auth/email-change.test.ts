/**
 * Better Auth's own routes cannot change a signed-in user's email. Only the
 * users service writes it, behind `users:update`.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { signInTestUser } from '@tests/auth';
import { expectConsole } from '@tests/console';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { handleAuthRequest } from '@/auth/better-auth';

const EMAIL = 'owner@test.dev';

let db: Kysely<DB>;
let basePath: string;

beforeEach(async () => {
    db = await createTestDb();
    basePath = setupTestConfig(makeTestConfig()).basePath;
});

function postAuth(path: string, headers: Headers, body: unknown): Promise<Response> {
    const request = new Request(`http://localhost${basePath}/api/auth/${path}`, {
        method: 'POST',
        headers: new Headers([...headers, ['Content-Type', 'application/json']]),
        body: JSON.stringify(body),
    });
    return handleAuthRequest(request, undefined);
}

describe("Better Auth's email routes", () => {
    it.each([
        ['change-email', { newEmail: 'taken-over@test.dev' }],
        ['update-user', { email: 'taken-over@test.dev' }],
    ])('refuse /%s for a signed-in user', async (path, body) => {
        // Better Auth logs the disabled route as an error of its own.
        if (path === 'change-email') expectConsole('error', 'Change email is disabled');
        const { id, headers } = await signInTestUser(db, EMAIL);

        const response = await postAuth(path, headers, body);

        expect(response.status).toBe(400);
        expect((await currentServices.users.get({ id }))?.email).toBe(EMAIL);
    });
});
