/**
 * The captcha check in front of Better Auth's sign-in and reset-request routes,
 * through the real HTTP app. `fetch` is stubbed because siteverify leaves the process.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { signInTestUser, TEST_PASSWORD } from '@tests/auth';
import { expectConsole } from '@tests/console';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
import { createHttpApp } from '@/transport/http/app';

const EMAIL = 'captcha@test.dev';

let db: Kysely<DB>;
let app: ReturnType<typeof createHttpApp>;
let verifyCalls: number;

beforeEach(async () => {
    db = await createTestDb();
    verifyCalls = 0;
    setEnvSource({ ASTROMECH_CAPTCHA_SECRET: 'super-secret' });
    // Every token passes for `sign_in` on the request's own hostname.
    vi.stubGlobal('fetch', () => {
        verifyCalls += 1;
        return Promise.resolve(
            Response.json({ success: true, action: 'sign_in', hostname: 'localhost' })
        );
    });
    configure(true);
    await signInTestUser(db, EMAIL);
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearEnvSource();
});

function configure(captcha: boolean): void {
    app = createHttpApp(
        setupTestConfig({
            ...makeTestConfig(),
            security: {
                ...(captcha && {
                    captcha: { provider: 'turnstile', siteKey: 'site-key' },
                }),
            },
        })
    );
}

function post(path: string, body: object, token?: string): Promise<Response> {
    return Promise.resolve(
        app.request(`/cms/api/auth/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token !== undefined && { 'x-captcha-response': token }),
            },
            body: JSON.stringify(body),
        })
    );
}

const credentials = { email: EMAIL, password: TEST_PASSWORD };

describe('a configured captcha', () => {
    it('refuses sign-in without a token, before Better Auth sees it', async () => {
        const response = await post('sign-in/email', {
            email: EMAIL,
            password: 'wrong-password',
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            code: 'CAPTCHA_FAILED',
            message: 'The captcha check failed. Try again.',
        });
        expect(verifyCalls).toBe(0);
        expect(await db.selectFrom('signInFailures').selectAll().execute()).toEqual([]);
    });

    it('lets sign-in through with a passing token', async () => {
        const response = await post('sign-in/email', credentials, 'a-token');

        expect(response.status).toBe(200);
        expect(verifyCalls).toBe(1);
    });

    it('refuses a sign-in token on the reset request', async () => {
        const response = await post(
            'request-password-reset',
            { email: EMAIL, redirectTo: '/reset' },
            'a-token'
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'CAPTCHA_FAILED' });
    });

    it('refuses with no secret set', async () => {
        clearEnvSource();
        expectConsole('error', /captcha secret/);

        const response = await post('sign-in/email', credentials, 'a-token');

        expect(response.status).toBe(403);
        expect(verifyCalls).toBe(0);
    });

    it('leaves the other auth routes alone', async () => {
        const response = await app.request('/cms/api/auth/get-session');

        expect(response.status).toBe(200);
        expect(verifyCalls).toBe(0);
    });
});

describe('no captcha configured', () => {
    it('checks nothing', async () => {
        configure(false);

        const response = await post('sign-in/email', credentials);

        expect(response.status).toBe(200);
        expect(verifyCalls).toBe(0);
    });
});
