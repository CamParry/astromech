/** `routes/security.ts` over the real router: the permission, the shapes and the guards. */

import type { AllowedAddress, BlockedAddress, User } from '@/types/index';
import { makeUser, roleWith } from '@tests/fixtures';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    requestAs,
    setupTestConfig,
} from '@tests/harness';
import { mountRouter, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { createHttpApp } from '@/transport/http/app';
import { securityRouter } from '@/transport/http/routes/security';

const manager = roleWith(['security:manage']);
const editor = roleWith(['users:read']);

function app(role = manager) {
    return mountRouter('/security', securityRouter, role);
}

function post(path: string, body: unknown, role = manager): Promise<Response> {
    return Promise.resolve(
        app(role).request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    );
}

beforeEach(async () => {
    await seedTestUser(await createTestDb());
    setupTestConfig(makeTestConfig());
});

describe('the security routes', () => {
    it.each([
        ['GET', '/security/blocked'],
        ['POST', '/security/blocked'],
        ['DELETE', '/security/blocked/x'],
        ['GET', '/security/allowed'],
        ['POST', '/security/allowed'],
        ['DELETE', '/security/allowed/x'],
    ])('refuses %s %s without security:manage', async (method, path) => {
        const response = await app(editor).request(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            ...(method === 'POST'
                ? { body: JSON.stringify({ address: '10.0.0.1' }) }
                : {}),
        });

        expect(response.status).toBe(403);
    });

    it('blocks an address and lists it', async () => {
        const created = await post('/security/blocked', {
            address: '203.0.113.0/24',
            reason: 'Scanner',
            expiresAt: null,
        });
        const listed = await app().request('/security/blocked');

        expect(created.status).toBe(201);
        const block = ((await created.json()) as { data: BlockedAddress }).data;
        expect(block).toMatchObject({
            address: '203.0.113.0/24',
            reason: 'Scanner',
            source: 'manual',
            expiresAt: null,
        });
        expect(((await listed.json()) as { data: BlockedAddress[] }).data).toHaveLength(
            1
        );
    });

    it('rejects an address that is not an IP address or range', async () => {
        const response = await post('/security/blocked', { address: 'not-an-ip' });

        expect(response.status).toBe(422);
    });

    it('unblocks with a 204', async () => {
        const block = await currentServices.security.block({
            data: { address: '10.0.0.1' },
        });

        const response = await app().request(`/security/blocked/${block.id}`, {
            method: 'DELETE',
        });

        expect(response.status).toBe(204);
        expect(await currentServices.security.listBlocked()).toEqual([]);
    });

    it('lists only the blocks in force', async () => {
        await currentServices.security.block({
            data: { address: '10.0.0.1', expiresAt: new Date(Date.now() - 60_000) },
        });
        await currentServices.security.block({ data: { address: '10.0.0.2' } });

        const response = await app().request('/security/blocked');

        const rows = ((await response.json()) as { data: BlockedAddress[] }).data;
        expect(rows.map((row) => row.address)).toEqual(['10.0.0.2']);
    });

    it('allows an address once and refuses it twice with a 409', async () => {
        const first = await post('/security/allowed', { address: '10.0.0.1' });
        const second = await post('/security/allowed', { address: '10.0.0.1' });
        const listed = await app().request('/security/allowed');

        expect(first.status).toBe(201);
        expect(second.status).toBe(409);
        expect(((await listed.json()) as { data: AllowedAddress[] }).data).toHaveLength(
            1
        );
    });

    it('removes an allowed address with a 204', async () => {
        const allowed = await currentServices.security.allow({
            data: { address: '10.0.0.1' },
        });

        const response = await app().request(`/security/allowed/${allowed.id}`, {
            method: 'DELETE',
        });

        expect(response.status).toBe(204);
        expect(await currentServices.security.listAllowed()).toEqual([]);
    });
});

describe('blocking from the signed-in address', () => {
    it('refuses a range that covers the caller, and allows one that does not', async () => {
        const db = await createTestDb();
        const httpApp = createHttpApp(
            setupTestConfig({ ...makeTestConfig(), security: { trustProxy: true } })
        );
        const admin: User = makeUser({ id: 'admin-1', email: 'admin@test.dev' });
        await createTestUser(db, { id: admin.id, email: admin.email });
        const blockFrom = (address: string) =>
            requestAs(
                httpApp,
                { user: admin, role: manager },
                '/cms/api/security/blocked',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-forwarded-for': '198.51.100.9',
                    },
                    body: JSON.stringify({ address }),
                }
            );

        const own = await blockFrom('198.51.100.0/24');
        const other = await blockFrom('203.0.113.0/24');

        expect(own.status).toBe(409);
        expect(other.status).toBe(201);
    });
});
