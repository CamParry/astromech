/**
 * The block list and allow list over the HTTP app: what a blocked address is
 * refused, what the allow list overrides, and when a change reaches a request.
 */

import type { DB } from '@/database/types';
import type { PluginDefinition } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { noInput } from '@/services/define-service-method';
import { createHttpApp } from '@/transport/http/app';

const probePlugin: PluginDefinition = {
    package: 'probe',
    service: {
        ping: {
            access: 'public',
            input: noInput(),
            mutates: false,
            handler: () => 'pong',
        },
    },
};

const BLOCKED = '203.0.113.7';
const MINUTE = 60_000;

let db: Kysely<DB>;
let app: ReturnType<typeof createHttpApp>;

beforeEach(async () => {
    db = await createTestDb();
    app = createHttpApp(
        setupTestConfig({
            ...makeTestConfig(),
            plugins: [probePlugin],
            security: { trustProxy: true },
        })
    );
});

afterEach(() => {
    vi.useRealTimers();
});

/** Request `path` as the client at `address`. */
async function requestFrom(
    address: string | undefined,
    path: string,
    method = 'GET'
): Promise<Response> {
    return await app.request(path, {
        method,
        headers: address === undefined ? {} : { 'x-forwarded-for': address },
    });
}

async function expectBlocked(response: Response): Promise<void> {
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
        error: {
            code: 'ADDRESS_BLOCKED',
            message: 'Requests from this address are blocked.',
        },
    });
}

describe('the block list', () => {
    it.each([
        ['GET', '/cms/api/setup/check'],
        ['GET', '/cms/api/auth/get-session'],
        ['POST', '/cms/api/plugins/probe/ping'],
        ['GET', '/cms/api/entries/post'],
    ])('refuses %s %s from a blocked address', async (method, path) => {
        await currentServices.security.block({ data: { address: BLOCKED } });

        await expectBlocked(await requestFrom(BLOCKED, path, method));
        expect((await requestFrom('203.0.113.8', '/cms/api/setup/check')).status).toBe(
            200
        );
    });

    it('refuses an address inside a blocked range', async () => {
        await currentServices.security.block({ data: { address: '203.0.113.0/24' } });

        await expectBlocked(await requestFrom('203.0.113.200', '/cms/api/setup/check'));
        expect((await requestFrom('203.0.114.1', '/cms/api/setup/check')).status).toBe(
            200
        );
    });

    it('lets an allowed address through a block that covers it', async () => {
        await currentServices.security.block({ data: { address: '203.0.113.0/24' } });
        await currentServices.security.allow({ data: { address: BLOCKED } });

        expect((await requestFrom(BLOCKED, '/cms/api/setup/check')).status).toBe(200);
        await expectBlocked(await requestFrom('203.0.113.8', '/cms/api/setup/check'));
    });

    it('lets a request with no known address through', async () => {
        await currentServices.security.block({ data: { address: '0.0.0.0/0' } });

        expect((await requestFrom(undefined, '/cms/api/setup/check')).status).toBe(200);
    });

    it('ignores a block that has expired', async () => {
        await currentServices.security.block({
            data: { address: BLOCKED, expiresAt: new Date(Date.now() - MINUTE) },
        });

        expect((await requestFrom(BLOCKED, '/cms/api/setup/check')).status).toBe(200);
    });

    it('stops refusing a block that expires inside the cache lifetime', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
        await currentServices.security.block({
            data: { address: BLOCKED, expiresAt: new Date(Date.now() + 30_000) },
        });
        await expectBlocked(await requestFrom(BLOCKED, '/cms/api/setup/check'));

        vi.setSystemTime(Date.now() + 31_000);

        expect((await requestFrom(BLOCKED, '/cms/api/setup/check')).status).toBe(200);
    });

    it('applies an unblock through the service at once', async () => {
        const block = await currentServices.security.block({
            data: { address: BLOCKED },
        });
        await expectBlocked(await requestFrom(BLOCKED, '/cms/api/setup/check'));

        await currentServices.security.unblock({ id: block.id });

        expect((await requestFrom(BLOCKED, '/cms/api/setup/check')).status).toBe(200);
    });

    it('applies an unblock from another isolate after the cache lifetime', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
        await currentServices.security.block({ data: { address: BLOCKED } });
        await expectBlocked(await requestFrom(BLOCKED, '/cms/api/setup/check'));

        // Another isolate's write, which this process's cache cannot see.
        await db.deleteFrom('blockedAddresses').execute();
        await expectBlocked(await requestFrom(BLOCKED, '/cms/api/setup/check'));
        vi.setSystemTime(Date.now() + 60_001);

        expect((await requestFrom(BLOCKED, '/cms/api/setup/check')).status).toBe(200);
    });
});
