/**
 * The handlers the composed app declares itself — `GET /setup/check`,
 * `GET /me` and the Better Auth catch-all — plus the `requireAuth` boundary
 * they sit either side of.
 *
 * These are the only route tests that mount the whole `transport/http` app, so
 * they are also where the 401 for an unauthenticated request is pinned.
 */

import type { Role, User } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { adminRole } from '@tests/fixtures';
import { createTestDb, makeTestConfig, requestAs, setupTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { createHttpApp } from '@/transport/http/app';

const usersService = currentServices.users;

/** The API prefix the current app registered its routes under. */
let api: string;

async function freshApp(): Promise<OpenAPIHono> {
    await createTestDb();
    const resolved = setupTestConfig(makeTestConfig());
    api = `${resolved.basePath}/api`;
    return createHttpApp(resolved) as unknown as OpenAPIHono;
}

describe('GET /setup/check', () => {
    it('reports needsSetup: true on an empty install, with no session', async () => {
        const app = await freshApp();
        const res = await app.request(`${api}/setup/check`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ needsSetup: true });
    });

    it('reports needsSetup: false once a user exists', async () => {
        const app = await freshApp();
        await usersService.create({ data: { email: 'first@test.dev', name: 'First' } });
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
        const user = await usersService.create({
            data: {
                email: 'me@test.dev',
                name: 'Me',
            },
        });
        const res = await requestAs(app, { user, role: adminRole }, `${api}/me`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { user: User; role: Role } };
        expect(Object.keys(body.data).sort()).toEqual(['role', 'user']);
        expect(body.data.user.id).toBe(user.id);
        expect(body.data.role.slug).toBe('admin');
    });

    it('answers the public shape, stripping a key its schema does not declare', async () => {
        const app = await freshApp();
        const user = await usersService.create({
            data: { email: 'me@test.dev', name: 'Me' },
        });
        const userWithExtra = { ...user, internal: 'x' };
        const roleWithExtra = { ...adminRole, internal: 'x' };

        const res = await requestAs(
            app,
            { user: userWithExtra, role: roleWithExtra },
            `${api}/me`
        );
        const body = (await res.json()) as {
            data: { user: Record<string, unknown>; role: Record<string, unknown> };
        };
        expect(body.data.user).not.toHaveProperty('internal');
        expect(Object.keys(body.data.role)).toEqual([
            'slug',
            'name',
            'permissions',
            'isBuiltIn',
        ]);
    });
});

describe('GET /openapi.json', () => {
    it('401s without a session', async () => {
        const app = await freshApp();
        const res = await app.request(`${api}/openapi.json`);
        expect(res.status).toBe(401);
    });

    it('serves the document, `/me` included, with a session', async () => {
        const app = await freshApp();
        const user = await usersService.create({
            data: { email: 'me@test.dev', name: 'Me' },
        });
        const res = await requestAs(
            app,
            { user, role: adminRole },
            `${api}/openapi.json`
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            openapi: string;
            servers: { url: string }[];
            paths: Record<string, unknown>;
        };
        expect(body.openapi).toBe('3.1.0');
        expect(body.servers).toEqual([{ url: api }]);
        expect(Object.keys(body.paths)).toContain('/me');
        expect(Object.keys(body.paths)).toContain('/entries/{type}');
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

    it('answers 403 to a sign-up, on an empty install and once a user exists', async () => {
        const app = await freshApp();
        const signUp = (email: string) =>
            app.request(`${api}/auth/sign-up/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: 'password123', name: 'Sign Up' }),
            });

        const empty = await signUp('first@test.dev');
        expect(empty.status).toBe(403);
        await usersService.create({ data: { email: 'first@test.dev', name: 'First' } });
        const res = await signUp('second@test.dev');

        expect(res.status).toBe(403);
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe('SIGN_UP_CLOSED');
        const users = await usersService.query({ limit: 'all' });
        expect(users.data.map((user) => user.email)).toEqual(['first@test.dev']);
    });
});

describe('POST /setup', () => {
    const setup = (app: OpenAPIHono, body: unknown) =>
        app.request(`${api}/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

    const firstAdmin = {
        name: 'First',
        email: 'first@test.dev',
        password: 'password123',
    };

    it('creates the first admin with no session', async () => {
        const app = await freshApp();

        const res = await setup(app, firstAdmin);

        expect(res.status).toBe(200);
        const users = await usersService.query({ limit: 'all' });
        expect(users.data.map((user) => [user.email, user.role])).toEqual([
            ['first@test.dev', 'admin'],
        ]);
    });

    it('answers 403 SIGN_UP_CLOSED once a user exists', async () => {
        const app = await freshApp();
        await usersService.create({ data: { email: 'taken@test.dev', name: 'Taken' } });

        const res = await setup(app, firstAdmin);

        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string; status: number } };
        expect(body.error).toMatchObject({ code: 'SIGN_UP_CLOSED', status: 403 });
        const users = await usersService.query({ limit: 'all' });
        expect(users.data.map((user) => user.email)).toEqual(['taken@test.dev']);
    });

    it('answers 422 for a password under eight characters', async () => {
        const app = await freshApp();

        const res = await setup(app, { ...firstAdmin, password: 'short' });

        expect(res.status).toBe(422);
        const body = (await res.json()) as { error: { details: { fields: object } } };
        expect(Object.keys(body.error.details.fields)).toEqual(['password']);
        const users = await usersService.query({ limit: 'all' });
        expect(users.data).toEqual([]);
    });
});

describe('requireAuth covers every mounted domain router', () => {
    it.each([
        ['/entries/post'],
        ['/users'],
        ['/media'],
        ['/entry-types'],
        ['/notifications'],
    ])('401s %s without a session', async (path) => {
        const app = await freshApp();
        const res = await app.request(`${api}${path}`);
        expect(res.status).toBe(401);
    });

    it('404s an unknown path with the canonical error envelope', async () => {
        const app = await freshApp();
        const user = await usersService.create({
            data: { email: 'x@test.dev', name: 'X' },
        });
        const res = await requestAs(app, { user, role: adminRole }, `${api}/nope`);
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe(`Route GET ${api}/nope not found`);
    });
});
