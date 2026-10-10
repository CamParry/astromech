/**
 * The Astro route handler passes the connection's address to the app, so a
 * Node site without `security.trustProxy` counts sign-in attempts per client,
 * unless Astro's `security.allowedDomains` is set and the request carries
 * `x-forwarded-for`, which Astro may have read the address from.
 */

import type { DB } from '@/database/types';
import type { SchedulerDriver } from '@/types/index';
import type { APIContext } from 'astro';
import type { Kysely } from 'kysely';
import { signInTestUser, TEST_PASSWORD } from '@tests/auth';
import { expectConsole } from '@tests/console';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAstromech } from '@/astromech';
import { ALL } from '@/integrations/astro/handler';

// What the integration baked into the virtual module, set per test. Read
// through a getter because the mock is built before any test runs.
const site = vi.hoisted(() => ({ astroReadsForwardedFor: false }));

vi.mock('virtual:astromech/config', () => ({
    rawConfig: undefined,
    get astroReadsForwardedFor() {
        return site.astroReadsForwardedFor;
    },
}));

const EMAIL = 'handler@test.dev';

/** Starts nothing, so a boot here leaves no ticker running. */
const noScheduler: SchedulerDriver = { name: 'none' };

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    site.astroReadsForwardedFor = false;
    await createAstromech({ config: { ...makeBootConfig(), scheduler: noScheduler } });
    await signInTestUser(db, EMAIL);
});

/**
 * Sign in through the handler as Astro calls it, from a connection at
 * `clientAddress` (a getter that throws when undefined, as Astro's does when
 * the adapter has no address) sending `forwardedFor`, or no `x-forwarded-for`
 * when it is null.
 */
async function signIn(
    clientAddress: string | undefined,
    forwardedFor: string | null = '198.51.100.99'
): Promise<number> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (forwardedFor !== null) headers.set('x-forwarded-for', forwardedFor);
    const request = new Request('http://localhost/cms/api/auth/sign-in/email', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: EMAIL, password: TEST_PASSWORD }),
    });
    const context = {
        request,
        get clientAddress(): string {
            if (clientAddress === undefined) {
                throw new Error('no address from the adapter');
            }
            return clientAddress;
        },
    } as unknown as APIContext;
    const response = await ALL(context);
    return response.status;
}

describe('the Astro route handler', () => {
    it('counts each connection apart, whatever x-forwarded-for it sends', async () => {
        expectConsole('error', 'set `security.trustProxy`');
        const first = [];
        for (const forwardedFor of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
            first.push(await signIn('203.0.113.1', forwardedFor));
        }
        const fourthFromFirst = await signIn('203.0.113.1', '198.51.100.4');
        const firstFromSecond = await signIn('203.0.113.2');

        expect(first).toEqual([200, 200, 200]);
        expect(fourthFromFirst).toBe(429);
        expect(firstFromSecond).toBe(200);
    });

    it('shares one count when Astro may have read the address from x-forwarded-for', async () => {
        site.astroReadsForwardedFor = true;
        expectConsole('error', 'set `security.trustProxy`');
        for (let attempt = 0; attempt < 3; attempt++) {
            expect(await signIn('203.0.113.1')).toBe(200);
        }

        expect(await signIn('203.0.113.2')).toBe(429);
    });

    it('counts each connection apart under allowedDomains when no request carries x-forwarded-for', async () => {
        site.astroReadsForwardedFor = true;
        for (let attempt = 0; attempt < 3; attempt++) {
            expect(await signIn('203.0.113.1', null)).toBe(200);
        }

        expect(await signIn('203.0.113.1', null)).toBe(429);
        expect(await signIn('203.0.113.2', null)).toBe(200);
    });

    it('serves a request when the adapter gives no address', async () => {
        expect(await signIn(undefined, null)).toBe(200);
    });
});
