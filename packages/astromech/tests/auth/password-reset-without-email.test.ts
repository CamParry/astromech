/**
 * A password reset on a site with no email driver. The link is a working
 * credential for the account, so it reaches the log only in development, where
 * the log is the developer's own terminal.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { handleAuthRequest } from '@/auth/better-auth';
import { clearEnvSource, setEnvSource } from '@/env';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';

const EMAIL = 'no-driver@test.dev';

let db: Kysely<DB>;
let basePath: string;

beforeEach(async () => {
    db = await createTestDb();
    basePath = setupTestConfig(makeTestConfig()).basePath;
    await currentServices.users.create({
        data: { email: EMAIL, name: 'No driver', role: DEFAULT_ROLE_SLUG },
    });
});

afterEach(clearEnvSource);

/**
 * Request a reset for `EMAIL` under `nodeEnv`, and return what was logged and
 * the token the reset link carries.
 */
async function requestReset(nodeEnv: string): Promise<{ logged: string; token: string }> {
    setEnvSource({ NODE_ENV: nodeEnv });
    // Every `log` level writes to `console.error`, so this sees all of them.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handleAuthRequest(
        new Request(`http://localhost${basePath}/api/auth/request-password-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: EMAIL,
                redirectTo: `${basePath}/reset-password`,
            }),
        }),
        undefined
    );
    expect(response.status).toBe(200);

    const verification = await db
        .selectFrom('verifications')
        .select('identifier')
        .where('identifier', 'like', 'reset-password:%')
        .executeTakeFirstOrThrow();
    const logged = error.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    return { logged, token: verification.identifier.slice('reset-password:'.length) };
}

describe('a password reset with no email driver', () => {
    it('logs the reset link in development', async () => {
        const { logged, token } = await requestReset('development');

        expect(logged).toContain(`Password reset URL for ${EMAIL}`);
        expect(logged).toContain(token);
    });

    it.each(['production', 'test'])(
        'logs that no email driver is configured, without the link, in %s',
        async (nodeEnv) => {
            const { logged, token } = await requestReset(nodeEnv);

            expect(logged).toContain('No email driver is configured');
            expect(logged).not.toContain(token);
        }
    );
});
