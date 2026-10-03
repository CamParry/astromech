/**
 * Better Auth's rate limiter over HTTP. It runs outside production, counts the
 * address `getClientAddress` trusts rather than one a client sends, and keeps
 * its count in the database, where every app instance on it reads the same one.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig } from '@/types/index';
import type { Kysely } from 'kysely';
import { signInTestUser, TEST_PASSWORD } from '@tests/auth';
import { expectConsole } from '@tests/console';
import {
    createTestDb,
    makeTestConfig,
    resetRuntime,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { createHttpApp } from '@/transport/http/app';

/** The composed HTTP app, typed as `createHttpApp` builds it. */
type HttpApp = ReturnType<typeof createHttpApp>;

const EMAIL = 'limited@test.dev';

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
});

/** Publish the test config with `security` laid over it and build its HTTP app. */
function appWith(security: AstromechConfig['security'] = {}): HttpApp {
    return createHttpApp(setupTestConfig({ ...makeTestConfig(), security }));
}

/** Sign in as `EMAIL` over HTTP, sending `headers` as the client. */
async function signIn(
    app: HttpApp,
    headers: Record<string, string> = {}
): Promise<Response> {
    return await app.request('/cms/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ email: EMAIL, password: TEST_PASSWORD }),
    });
}

describe('the sign-in rate limit', () => {
    // Under `NODE_ENV=test`, as with an unset one on Workers, Better Auth's own
    // default leaves the limiter off. With no address, test counts 127.0.0.1 and
    // unset counts one `no-trusted-ip` key: either way, one count for everyone.
    it.each(['x-forwarded-for', 'x-astromech-client-address'])(
        'counts every attempt against one address when a client forges %s',
        async (header) => {
            const app = appWith();
            await signInTestUser(db, EMAIL);

            const allowed = [];
            for (const address of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
                allowed.push((await signIn(app, { [header]: address })).status);
            }
            const fourth = await signIn(app, { [header]: '198.51.100.4' });

            expect(allowed).toEqual([200, 200, 200]);
            expect(fourth.status).toBe(429);
        }
    );

    it('counts each trusted address apart', async () => {
        const app = appWith({ trustProxy: true });
        await signInTestUser(db, EMAIL);

        for (let attempt = 0; attempt < 3; attempt++) {
            await signIn(app, { 'x-forwarded-for': '203.0.113.1' });
        }
        const sameAddress = await signIn(app, { 'x-forwarded-for': '203.0.113.1' });
        const otherAddress = await signIn(app, { 'x-forwarded-for': '203.0.113.2' });

        expect(sameAddress.status).toBe(429);
        expect(otherAddress.status).toBe(200);
    });

    it('keeps the count in the database, shared by every app instance on it', async () => {
        const client = { 'x-forwarded-for': '203.0.113.1' };
        const first = appWith({ trustProxy: true });
        await signInTestUser(db, EMAIL);
        for (let attempt = 0; attempt < 3; attempt++) {
            expect((await signIn(first, client)).status).toBe(200);
        }

        // A second instance on the same database: fresh registries and a new
        // Better Auth, as another process or Workers isolate builds them.
        const driver = getDatabaseDriverOrThrow();
        resetRuntime();
        const second = createHttpApp(
            setupTestConfig({
                ...makeTestConfig(),
                db: driver,
                security: { trustProxy: true },
            })
        );
        const onSameDatabase = await signIn(second, client);

        // And one on a database of its own, which has counted nothing.
        db = await createTestDb();
        const third = appWith({ trustProxy: true });
        await signInTestUser(db, EMAIL);
        const onOtherDatabase = await signIn(third, client);

        expect(onSameDatabase.status).toBe(429);
        expect(onOtherDatabase.status).toBe(200);
    });
});

describe('the other limited routes', () => {
    it.each([
        // Better Auth answers an unknown email as it answers a known one, and warns.
        ['POST', '/request-password-reset', 2, { email: EMAIL, redirectTo: '/cms' }],
        [
            'POST',
            '/reset-password',
            3,
            { token: 'not-a-token', newPassword: 'x'.repeat(12) },
        ],
        ['GET', '/reset-password/not-a-token?callbackURL=/cms', 3, undefined],
    ])('limits %s %s to %i requests a minute', async (method, path, max, body) => {
        if (path === '/request-password-reset') {
            expectConsole('warn', 'Reset Password: User not found');
        }
        const app = appWith({ trustProxy: true });
        const send = async (): Promise<number> => {
            const response = await app.request(`/cms/api/auth${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-forwarded-for': '203.0.113.1',
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return response.status;
        };

        const allowed = [];
        for (let attempt = 0; attempt < max; attempt++) allowed.push(await send());

        expect(allowed).not.toContain(429);
        expect(await send()).toBe(429);
    });

    it('does not count /get-session, so it writes no row', async () => {
        const app = appWith({ trustProxy: true });
        const { headers } = await signInTestUser(db, EMAIL);
        headers.set('x-forwarded-for', '203.0.113.1');

        const statuses = [];
        for (let attempt = 0; attempt < 5; attempt++) {
            statuses.push(
                (await app.request('/cms/api/auth/get-session', { headers })).status
            );
        }
        const rows = await db.selectFrom('rateLimits').select('key').execute();

        expect(statuses).toEqual([200, 200, 200, 200, 200]);
        expect(rows).toEqual([]);
    });
});

describe('the session address', () => {
    it('is the address the proxy chain vouches for, not the one the client sent', async () => {
        const app = appWith({ trustProxy: 2 });
        await signInTestUser(db, EMAIL);

        const response = await signIn(app, {
            'x-forwarded-for': '198.51.100.9, 203.0.113.7, 10.0.0.1',
        });
        const { token } = (await response.json()) as { token: string };
        const session = await db
            .selectFrom('sessions')
            .select('ipAddress')
            .where('token', '=', token)
            .executeTakeFirstOrThrow();

        expect(session.ipAddress).toBe('203.0.113.7');
    });
});
