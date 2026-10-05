/**
 * The per-account sign-in lock over HTTP: five refused sign-ins in fifteen
 * minutes lock the email, known or not, for a time that doubles up to an hour.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { signInTestUser, TEST_PASSWORD } from '@tests/auth';
import { expectConsole } from '@tests/console';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '@/transport/http/app';

/** The composed HTTP app, typed as `createHttpApp` builds it. */
type HttpApp = ReturnType<typeof createHttpApp>;

const EMAIL = 'locked@test.dev';
const MINUTE = 60_000;

let db: Kysely<DB>;
let app: HttpApp;
let attempts = 0;
let declaredWarnings = false;

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T12:00:00.000Z'));
    attempts = 0;
    declaredWarnings = false;
    db = await createTestDb();
    app = createHttpApp(
        setupTestConfig({ ...makeTestConfig(), security: { trustProxy: true } })
    );
    await signInTestUser(db, EMAIL);
});

afterEach(() => {
    vi.useRealTimers();
});

/** Sign in from an address of its own, so the per-address limit never answers first. */
async function signIn(
    email: string,
    password: string,
    headers: Record<string, string> = {}
): Promise<Response> {
    attempts += 1;
    return await app.request('/cms/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': `203.0.113.${attempts % 250}`,
            ...headers,
        },
        body: JSON.stringify({ email, password }),
    });
}

/** Refuse `count` sign-ins as `email`, returning the last response. */
async function failSignIns(email: string, count: number): Promise<Response> {
    if (!declaredWarnings) {
        // Better Auth warns about each refused password and each unknown email.
        expectConsole('warn', /Invalid password|User not found/);
        declaredWarnings = true;
    }
    let last = new Response();
    for (let i = 0; i < count; i++) last = await signIn(email, 'wrong-password');
    return last;
}

function advance(ms: number): void {
    vi.setSystemTime(Date.now() + ms);
}

// Each refused sign-in hashes a password, which is slow when the suite shares a busy machine.
describe('the account lock', { timeout: 60_000 }, () => {
    it('refuses a sixth sign-in within the window, even with the right password', async () => {
        const fifth = await failSignIns(EMAIL, 5);
        const sixth = await signIn(EMAIL, TEST_PASSWORD);

        expect(fifth.status).toBe(401);
        expect(sixth.status).toBe(429);
        expect(await sixth.json()).toEqual({
            code: 'ACCOUNT_LOCKED',
            message:
                'Too many failed sign-ins for this account. Try again later, or reset your password.',
        });
        expect(sixth.headers.get('Retry-After')).toBe('300');
    });

    it('lets the right password in once the lock ends', async () => {
        await failSignIns(EMAIL, 5);
        advance(5 * MINUTE + 1000);

        const response = await signIn(EMAIL, TEST_PASSWORD);

        expect(response.status).toBe(200);
    });

    it('clears the count on a successful sign-in', async () => {
        await failSignIns(EMAIL, 4);
        expect((await signIn(EMAIL, TEST_PASSWORD)).status).toBe(200);
        await failSignIns(EMAIL, 4);

        expect((await signIn(EMAIL, TEST_PASSWORD)).status).toBe(200);
    });

    it('starts a new count once 15 minutes pass', async () => {
        await failSignIns(EMAIL, 4);
        advance(15 * MINUTE);
        await failSignIns(EMAIL, 4);

        expect((await signIn(EMAIL, TEST_PASSWORD)).status).toBe(200);
    });

    it('doubles each further lock, up to an hour', async () => {
        const retryAfter: (string | null)[] = [];
        for (let cycle = 0; cycle < 6; cycle++) {
            await failSignIns(EMAIL, 5);
            const refused = await signIn(EMAIL, TEST_PASSWORD);
            retryAfter.push(refused.headers.get('Retry-After'));
            advance(Number(refused.headers.get('Retry-After')) * 1000 + 1000);
        }

        expect(retryAfter).toEqual(['300', '600', '1200', '2400', '3600', '3600']);
    });

    it('locks an unknown email exactly as it locks an account', async () => {
        await failSignIns(EMAIL, 5);
        await failSignIns('nobody@test.dev', 5);

        const known = await signIn(EMAIL, 'wrong-password');
        const unknown = await signIn('nobody@test.dev', 'wrong-password');

        expect(unknown.status).toBe(known.status);
        expect(unknown.status).toBe(429);
        expect(await unknown.json()).toEqual(await known.json());
        expect(unknown.headers.get('Retry-After')).toBe(known.headers.get('Retry-After'));
    });

    it('counts an email without regard to its case', async () => {
        await failSignIns(EMAIL.toUpperCase(), 3);
        await failSignIns(EMAIL, 2);

        expect((await signIn(EMAIL, TEST_PASSWORD)).status).toBe(429);
    });

    it('stores a hash of the email, not the email', async () => {
        await failSignIns(EMAIL, 1);

        const rows = await db
            .selectFrom('signInFailures')
            .select('key')
            .where('key', 'like', 'account:%')
            .execute();

        expect(rows).toHaveLength(1);
        expect(rows[0]?.key).toMatch(/^account:[0-9a-f]{64}$/);
    });

    it('lets a locked account reset its password, which clears the lock', async () => {
        expectConsole('error', /email driver|Password reset URL/);
        await failSignIns(EMAIL, 5);
        const base = { 'Content-Type': 'application/json' };

        const request = await app.request('/cms/api/auth/request-password-reset', {
            method: 'POST',
            headers: { ...base, 'x-forwarded-for': '198.51.100.1' },
            body: JSON.stringify({ email: EMAIL, redirectTo: '/cms/reset-password' }),
        });
        const verification = await db
            .selectFrom('verifications')
            .select('identifier')
            .where('identifier', 'like', 'reset-password:%')
            .executeTakeFirstOrThrow();
        const reset = await app.request('/cms/api/auth/reset-password', {
            method: 'POST',
            headers: { ...base, 'x-forwarded-for': '198.51.100.2' },
            body: JSON.stringify({
                token: verification.identifier.slice('reset-password:'.length),
                newPassword: 'a-brand-new-password',
            }),
        });
        const signedIn = await signIn(EMAIL, 'a-brand-new-password');

        expect(request.status).toBe(200);
        expect(reset.status).toBe(200);
        expect(signedIn.status).toBe(200);
    });

    it('does not count a malformed email against any account', async () => {
        const response = await signIn('not-an-email', 'wrong-password');

        expect(response.status).toBe(400);
        expect(await db.selectFrom('signInFailures').select('key').execute()).toEqual([]);
    });
});
