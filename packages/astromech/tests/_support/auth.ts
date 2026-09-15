/**
 * Signed-in users for tests that need a real Better Auth session. Sign-up is
 * closed once a user exists, so the account is written directly, then signed in.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestUser } from '@tests/harness';
import { getAuth } from '@/users/auth';

const TEST_PASSWORD = 'password123';

/**
 * Create a user with a credential account and sign them in. Returns their id and
 * the headers a browser sends on its next request, which carry the session cookie.
 */
export async function signInTestUser(
    db: Kysely<DB>,
    email: string
): Promise<{ id: string; headers: Headers }> {
    const user = await createTestUser(db, { email });
    const auth = getAuth();
    const { internalAdapter, password } = await auth.$context;
    await internalAdapter.linkAccount({
        userId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password: await password.hash(TEST_PASSWORD),
    });
    const response = await auth.api.signInEmail({
        body: { email, password: TEST_PASSWORD },
        asResponse: true,
    });
    const cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(';', 1)[0])
        .join('; ');
    return { id: user.id, headers: new Headers({ cookie }) };
}
