/**
 * `routes/plugins.ts` — the RPC catch-all and the raw-route escape hatch.
 *
 * Both are bespoke by construction: the method id is two path params resolved
 * at request time, and access is `PluginAccess` rather than a method contract's
 * permission. These pin the three access branches, the two 404s, and the fact
 * that RPC returns the handler's result with no envelope around it.
 *
 * The router mounts its raw routes at import time, so every test re-imports the
 * module after registering the plugin set — the same dance
 * `entries-mounted.test.ts` does.
 */

import type { AstromechConfig, PluginDefinition, Role, User } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getSession } from '@/auth/session';
import { noInput } from '@/services/define-service-method';

vi.mock('@/auth/session', () => ({ getSession: vi.fn() }));

const mockGetSession = vi.mocked(getSession);

const probePlugin: PluginDefinition = {
    package: 'probe',
    service: {
        ping: {
            access: 'public',
            input: noInput(),
            mutates: false,
            handler: () => 'pong',
        },
        whoami: {
            access: 'authenticated',
            input: noInput(),
            mutates: false,
            handler: (_input, ctx) => ({ user: ctx.user?.id ?? null }),
        },
        echo: {
            access: { permission: 'read' },
            input: z.looseObject({}),
            mutates: false,
            handler: (input) => ({ echoed: input }),
        },
        nothing: {
            access: 'public',
            input: noInput(),
            mutates: true,
            handler: () => undefined,
        },
        strict: {
            access: 'public',
            input: z.object({ n: z.number() }),
            mutates: false,
            handler: (input) => input,
        },
    },
    rawRoutes: [
        {
            method: 'GET',
            path: '/raw-public',
            access: 'public',
            handler: () => new Response('raw ok', { status: 200 }),
        },
        {
            method: 'POST',
            path: '/raw-guarded',
            access: { permission: 'read' },
            handler: async (request) =>
                new Response(await request.text(), { status: 201 }),
        },
    ],
};

function configWithProbe(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [probePlugin] };
}

const signedInUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Re-evaluate the router so its import-time raw-route mounts see the plugin. */
async function freshApp(): Promise<OpenAPIHono> {
    await createTestDb();
    setupTestConfig(configWithProbe());
    vi.resetModules();
    const { pluginsRouter } = await import('@/transport/http/routes/plugins');
    const { runWithRequest } = await import('@/request-context/request-context');
    const { onError } = await import('@/transport/http/middleware/errors');
    const app = new OpenAPIHono();
    app.onError(onError);
    app.use('*', (c, next) => runWithRequest(c.req.raw, () => next()));
    app.route('/plugins', pluginsRouter);
    return app;
}

/** Answer `optionalAuth` with a session holding `permissions`, or with none. */
function signIn(permissions: string[] | null): void {
    if (permissions === null) {
        mockGetSession.mockResolvedValue(null);
        return;
    }
    mockGetSession.mockResolvedValue({
        user: signedInUser as never,
        role: roleWith(permissions),
        session: { id: 's1', userId: 'u1' } as never,
    });
}

beforeEach(() => {
    mockGetSession.mockReset();
    signIn(null);
});

afterEach(() => {
    vi.resetModules();
});

describe('POST /plugins/:name/:method — access branches', () => {
    it('runs a public method with no session and returns the raw result', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/ping', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect(await res.json()).toBe('pong');
    });

    it('serialises an undefined result as null', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/nothing', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toBeNull();
    });

    it('401s an authenticated method with no session', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/whoami', { method: 'POST' });
        expect(res.status).toBe(401);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'UNAUTHORIZED'
        );
    });

    it('runs an authenticated method with a session, and the context carries the user', async () => {
        signIn([]);
        const app = await freshApp();
        const res = await app.request('/plugins/probe/whoami', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: 'u1' });
    });

    it('403s a permission-gated method when the role lacks plugin:probe:read', async () => {
        signIn([]);
        const app = await freshApp();
        const res = await app.request('/plugins/probe/echo', { method: 'POST' });
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'FORBIDDEN'
        );
    });

    it('runs a permission-gated method and passes the JSON body through as input', async () => {
        signIn(['plugin:probe:read']);
        const app = await freshApp();
        const res = await app.request('/plugins/probe/echo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hello: 'world' }),
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ echoed: { hello: 'world' } });
    });

    it('treats an unparseable body as the empty argument object', async () => {
        signIn(['plugin:probe:read']);
        const app = await freshApp();
        const res = await app.request('/plugins/probe/echo', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ echoed: {} });
    });

    it('422s a body the method’s own input schema rejects', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/strict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ n: 'not a number' }),
        });
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { code: string; details: { fields: Record<string, string[]> } };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(Object.keys(body.error.details.fields)).toEqual(['n']);
    });
});

describe('POST /plugins/:name/:method — resolution failures', () => {
    it('404s an unknown plugin', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/nope/ping', { method: 'POST' });
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe('Plugin "nope" not found');
    });

    it('404s an unknown method on a known plugin', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/nosuch', { method: 'POST' });
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { message: string } };
        expect(body.error.message).toBe('Plugin method "probe.nosuch" not found');
    });
});

describe('raw routes', () => {
    it('serves a public raw route at /plugins/:serviceKey:path', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/raw-public');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('raw ok');
    });

    it('enforces a raw route’s declared permission', async () => {
        signIn([]);
        const app = await freshApp();
        const denied = await app.request('/plugins/probe/raw-guarded', {
            method: 'POST',
            body: 'payload',
        });
        expect(denied.status).toBe(403);

        signIn(['plugin:probe:read']);
        const allowed = await (
            await freshApp()
        ).request('/plugins/probe/raw-guarded', { method: 'POST', body: 'payload' });
        expect(allowed.status).toBe(201);
        expect(await allowed.text()).toBe('payload');
    });

    it('does not answer a raw route on the wrong verb', async () => {
        const app = await freshApp();
        const res = await app.request('/plugins/probe/raw-public', { method: 'POST' });
        // Falls through to the RPC catch-all, which finds no such method.
        expect(res.status).toBe(404);
    });
});
