/**
 * The handlers the composed app declares itself — `GET /setup/check`,
 * `GET /me` and the Better Auth catch-all — plus the `requireAuth` boundary
 * they sit either side of.
 *
 * These are the only route tests that mount the whole `transport/http` app, so
 * they are also where the 401 for an unauthenticated request is pinned.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { createHttpApp } from '@/transport/http/index';
import { Astromech } from '@/transport/local/index';
import type { Role, User } from '@/types/index';

vi.mock('@/users/session', () => ({ resolveSessionUser: vi.fn() }));

import { resolveSessionUser } from '@/users/session';

const mockResolveSessionUser = vi.mocked(resolveSessionUser);

const adminRole: Role = {
    slug: 'admin',
    name: 'Administrator',
    permissions: ['*'] as Role['permissions'],
    isBuiltIn: true,
};

/** Answer `requireAuth` with a session, or with none. */
function signIn(user: User | null): void {
    if (user === null) {
        mockResolveSessionUser.mockResolvedValue(null);
        return;
    }
    mockResolveSessionUser.mockResolvedValue({
        user: user as never,
        role: adminRole,
        session: { id: 's1', userId: user.id } as never,
    });
}

/** The API prefix the current app registered its routes under. */
let api: string;

async function freshApp(): Promise<OpenAPIHono> {
    await createTestDb();
    const resolved = setupTestConfig(makeTestConfig());
    api = `${resolved.basePath}/api`;
    return createHttpApp(resolved) as unknown as OpenAPIHono;
}

beforeEach(() => {
    mockResolveSessionUser.mockReset();
    signIn(null);
});

describe('GET /setup/check', () => {
    it('reports needsSetup: true on an empty install, with no session', async () => {
        const app = await freshApp();
        const res = await app.request(`${api}/setup/check`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ needsSetup: true });
    });

    it('reports needsSetup: false once a user exists', async () => {
        const app = await freshApp();
        await Astromech.users.create({ email: 'first@test.dev', name: 'First' });
        const res = await app.request(`${api}/setup/check`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ needsSetup: false });
    });
});

describe('GET /me', () => {
    it('401s without a session', async () => {
        const app = await freshApp();
        const res = await app.request(`${api}/me`);
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.message).toBe('Authentication required');
    });

    it('returns { data: { user, role } } with a session', async () => {
        const app = await freshApp();
        const user = await Astromech.users.create({
            email: 'me@test.dev',
            name: 'Me',
        });
        signIn(user);

        const res = await app.request(`${api}/me`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { user: User; role: Role } };
        expect(Object.keys(body.data).sort()).toEqual(['role', 'user']);
        expect(body.data.user.id).toBe(user.id);
        expect(body.data.role.slug).toBe('admin');
    });
});

describe('the Better Auth catch-all', () => {
    it('is reachable without a session', async () => {
        const app = await freshApp();
        const res = await app.request(`${api}/auth/sign-in/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'not-an-email', password: 'x' }),
        });

        // Better Auth's own 400. A 401 with our `UNAUTHORIZED` code would mean
        // `requireAuth` swallowed the route and sign-in is unreachable.
        expect(res.status).toBe(400);
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe('INVALID_EMAIL');
    });
});

describe('requireAuth covers every mounted domain router', () => {
    it.each([
        ['/entries/post'],
        ['/users'],
        ['/media'],
        ['/settings'],
        ['/entry-types'],
        ['/notifications'],
    ])('401s %s without a session', async (path) => {
        const app = await freshApp();
        const res = await app.request(`${api}${path}`);
        expect(res.status).toBe(401);
    });

    it('404s an unknown path with the canonical error envelope', async () => {
        const app = await freshApp();
        const user = await Astromech.users.create({ email: 'x@test.dev', name: 'X' });
        signIn(user);

        const res = await app.request(`${api}/nope`);
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe(`Route GET ${api}/nope not found`);
    });
});
