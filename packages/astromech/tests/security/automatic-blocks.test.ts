/**
 * Automatic blocks: an address that fails sign-in across many accounts is
 * blocked for an hour, unless the allow list holds it.
 */

import { expectConsole } from '@tests/console';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { recordSignInFailure } from '@/security/sign-in-failures';
import { createHttpApp } from '@/transport/http/app';

const MINUTE = 60_000;
const CLIENT = '203.0.113.50';

let app: ReturnType<typeof createHttpApp>;

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T12:00:00.000Z'));
    await createTestDb();
    app = createHttpApp(
        setupTestConfig({ ...makeTestConfig(), security: { trustProxy: true } })
    );
});

afterEach(() => {
    vi.useRealTimers();
});

/** Refuse `count` sign-ins from `address`, each as a different account. */
async function failFrom(address: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
        await recordSignInFailure({ email: `user-${i}@test.dev`, address });
    }
}

/** The status the API answers a request from `address` with. */
async function statusFor(address: string): Promise<number> {
    const response = await app.request('/cms/api/setup/check', {
        headers: { 'x-forwarded-for': address },
    });
    return response.status;
}

describe('automatic blocks', () => {
    it('blocks an address after 20 failed sign-ins across accounts in 15 minutes', async () => {
        await failFrom(CLIENT, 19);
        expect(await statusFor(CLIENT)).toBe(200);

        await failFrom(CLIENT, 1);

        expect(await statusFor(CLIENT)).toBe(403);
        const [block] = await currentServices.security.listBlocked();
        expect(block).toMatchObject({
            address: CLIENT,
            source: 'automatic',
            reason: 'Repeated failed sign-ins',
            expiresAt: new Date(Date.now() + 60 * MINUTE),
        });
    });

    it(
        'counts failures over HTTP, from the address the proxy vouches for',
        { timeout: 60_000 },
        async () => {
            expectConsole('warn', /Invalid password|User not found/);
            for (let i = 0; i < 20; i++) {
                // Three a minute, so Better Auth's own limit never answers first.
                if (i % 3 === 0) vi.setSystemTime(Date.now() + MINUTE + 1000);
                await app.request('/cms/api/auth/sign-in/email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-forwarded-for': CLIENT,
                    },
                    body: JSON.stringify({
                        email: `nobody-${i}@test.dev`,
                        password: 'wrong-password',
                    }),
                });
            }

            expect(await statusFor(CLIENT)).toBe(403);
        }
    );

    it('lifts the automatic block after an hour', async () => {
        await failFrom(CLIENT, 20);
        expect(await statusFor(CLIENT)).toBe(403);

        vi.setSystemTime(Date.now() + 61 * MINUTE);

        expect(await statusFor(CLIENT)).toBe(200);
    });

    it('never blocks an allowed address', async () => {
        await currentServices.security.allow({ data: { address: CLIENT } });

        await failFrom(CLIENT, 30);

        expect(await statusFor(CLIENT)).toBe(200);
        expect(await currentServices.security.listBlocked()).toEqual([]);
    });

    it('blocks an IPv6 client by its /64', async () => {
        await failFrom('2001:db8:1:2::1', 20);

        expect(await statusFor('2001:db8:1:2:aaaa::9')).toBe(403);
        expect(await statusFor('2001:db8:1:3::1')).toBe(200);
    });

    it('an automatic block leaves a manual block on the same address as it was', async () => {
        const manual = await currentServices.security.block({
            data: {
                address: CLIENT,
                reason: 'Abuse report',
                expiresAt: new Date(Date.now() + 5 * MINUTE),
            },
        });

        await failFrom(CLIENT, 20);

        expect(await currentServices.security.listBlocked()).toEqual([manual]);
    });

    it('lengthens an automatic block it meets again', async () => {
        await failFrom(CLIENT, 20);
        vi.setSystemTime(Date.now() + 30 * MINUTE);
        await failFrom(CLIENT, 20);

        const [block] = await currentServices.security.listBlocked();
        expect(block?.expiresAt).toEqual(new Date(Date.now() + 60 * MINUTE));
    });
});
