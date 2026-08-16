/**
 * The manifest RPC route (`POST /rpc/:id`) over the real composed Hono app.
 *
 * The property that makes the route trustworthy, and the one
 * `tests/transport/mcp/parity.test.ts` holds for the MCP projection: every
 * manifest method is either reached or refused with the reason its dispatcher
 * declares, with no third outcome. A method the route quietly 404s or 500s is a
 * method the manifest advertises and the transport cannot serve.
 *
 * The app reads `Astromech.config` at import time, so it is imported after the
 * config and the manifest are in place.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, roleWith } from '@tests/mount-router';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { buildScopedDispatch } from '@/transport/tools/dispatch';
import { Astromech } from '@/transport/local/index';
import type {
    AstromechConfig,
    MethodManifest,
    PluginDefinition,
    Role,
    User,
} from '@/types/index';

vi.mock('@/users/session', () => ({ resolveSessionUser: vi.fn() }));

import { resolveSessionUser } from '@/users/session';

const mockResolveSessionUser = vi.mocked(resolveSessionUser);

// ============================================================================
// Fixture — a plugin covers the two refusals only a plugin method produces
// ============================================================================

const testPlugin: PluginDefinition = {
    package: '@test/my-plugin',
    entries: [
        {
            type: 'widget',
            single: 'Widget',
            plural: 'Widgets',
            fields: [{ name: 'title', type: 'text' }],
        },
    ],
    service: {
        doSomething: {
            access: { permission: 'plugins:x:do' },
            summary: 'Do something.',
            input: z.object({ thing: z.string() }),
            mutates: true,
            handler: async () => undefined,
        },
        // No `input` — a method that does not describe its call cannot be
        // dispatched, and is refused rather than given a synthesised schema.
        undescribed: {
            access: 'public',
            summary: 'Undescribed.',
            mutates: false,
            handler: async () => undefined,
        },
    },
};

function testConfig(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [testPlugin] };
}

// ============================================================================
// Harness
// ============================================================================

let manifest: MethodManifest;
let signedInUser: User;

/** Answer `requireAuth` with `user` under `role`, or with no session at all. */
function signIn(user: User | null, role: Role): void {
    if (user === null) {
        mockResolveSessionUser.mockResolvedValue(null);
        return;
    }
    mockResolveSessionUser.mockResolvedValue({
        user: user as never,
        role,
        session: { id: 's1', userId: user.id } as never,
    });
}

/**
 * A fresh DB, config and boot-generated manifest, with the composed app mounted
 * over them and `role` signed in.
 */
async function freshApp(role: Role = adminRole): Promise<OpenAPIHono> {
    await createTestDb();
    const resolved = setupTestConfig(testConfig());
    manifest = generateMethodManifest(resolved, [testPlugin]);
    setMethodManifest(manifest);

    signedInUser = await Astromech.users.create({ email: 'rpc@test.dev', name: 'RPC' });
    signIn(signedInUser, role);

    vi.resetModules();
    const mod = await import('@/transport/http/index');
    return mod.app as unknown as OpenAPIHono;
}

/** POST one method id, percent-encoded so a qualified entry type id survives. */
async function call(app: OpenAPIHono, id: string, args: unknown = {}): Promise<Response> {
    return app.request(`/rpc/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
    });
}

type ErrorBody = { error: { code: string; message: string } };

beforeEach(() => {
    mockResolveSessionUser.mockReset();
});

afterEach(() => {
    vi.resetModules();
});

// ============================================================================
// Parity — the manifest and the route describe the same surface
// ============================================================================

describe('manifest ↔ RPC route parity', () => {
    it('reaches or refuses every manifest method, with no third outcome', async () => {
        const app = await freshApp();
        const reached: string[] = [];
        const refused: string[] = [];

        for (const method of manifest.methods) {
            const dispatch = buildScopedDispatch(method, adminRole);
            const res = await call(app, method.id);

            if (!dispatch.ok) {
                const body = (await res.json()) as ErrorBody;
                expect(res.status, `${method.id} was not refused`).toBe(400);
                expect(
                    body.error.message,
                    `${method.id} was refused for a reason it did not declare`
                ).toContain(dispatch.reason);
                refused.push(method.id);
                continue;
            }

            // Reached: the call ran, or its arguments failed the contract's own
            // schema. Never a 404 (the route did not find a method the manifest
            // declares) and never a 500.
            expect([200, 422], `${method.id} answered ${res.status}`).toContain(
                res.status
            );
            reached.push(method.id);
        }

        expect(reached.length + refused.length).toBe(manifest.methods.length);
        // Guards the loop above against passing on a trivial manifest.
        expect(reached.length).toBeGreaterThan(80);
    });

    it('refuses only the methods that declared themselves uncallable', async () => {
        const app = await freshApp();
        const refused = new Map<string, string>();

        for (const method of manifest.methods) {
            const res = await call(app, method.id);
            if (res.status !== 400) continue;
            const body = (await res.json()) as ErrorBody;
            refused.set(method.id, body.error.message);
        }

        expect([...refused.keys()].sort()).toEqual([
            'media.replace',
            'media.upload',
            'plugins.testMyPlugin.doSomething',
            'plugins.testMyPlugin.undescribed',
        ]);
        expect(refused.get('media.upload')).toContain('binary input');
        expect(refused.get('media.replace')).toContain('binary input');
        expect(refused.get('plugins.testMyPlugin.doSomething')).toContain(
            'plugin method'
        );
        expect(refused.get('plugins.testMyPlugin.undescribed')).toContain(
            'no input schema'
        );
    });

    it('reaches a session-scoped method — the transport has a signed-in user', async () => {
        // MCP refuses all four notifications methods for want of a subject; this
        // route mounts after requireAuth, so the scoped handle fills one.
        const app = await freshApp();
        const res = await call(app, 'notifications.list');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: [] });
    });

    it('addresses a plugin entry type by its percent-encoded qualified id', async () => {
        const app = await freshApp();
        const res = await call(app, 'entries.test_my_plugin/widget.query');
        expect(res.status).toBe(200);
    });
});

// ============================================================================
// The route's own behaviour
// ============================================================================

describe('POST /rpc/:id', () => {
    it('returns the { data } envelope the REST routes return', async () => {
        const app = await freshApp();
        const res = await call(app, 'users.get', { id: signedInUser.id });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: User };
        expect(body.data.id).toBe(signedInUser.id);
    });

    it('takes the entry type from the id, not from the body', async () => {
        const app = await freshApp();
        await Astromech.entries.create({ type: 'post', title: 'Hello' });

        // `full` is the caller's to pass; `type` is not, and is never in the body.
        const res = await call(app, 'entries.post.query', { full: true });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { data: { title: string }[] } };
        expect(body.data.data.map((entry) => entry.title)).toEqual(['Hello']);
    });

    it('404s an unknown method id', async () => {
        const app = await freshApp();
        const res = await call(app, 'users.explode');
        expect(res.status).toBe(404);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toContain('users.explode');
    });

    it('422s a body the contract schema rejects', async () => {
        const app = await freshApp();
        const res = await call(app, 'users.create', { email: 42, name: 'Nope' });
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { code: string; details: { fields: Record<string, string[]> } };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(Object.keys(body.error.details.fields)).toContain('email');
    });

    it('401s without a session', async () => {
        const app = await freshApp();
        signIn(null, adminRole);
        const res = await call(app, 'users.query');
        expect(res.status).toBe(401);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('403s a role that lacks the method’s permission, naming it', async () => {
        const app = await freshApp(roleWith([]));
        const res = await call(app, 'users.create', {
            email: 'new@test.dev',
            name: 'New',
        });
        expect(res.status).toBe(403);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('FORBIDDEN');
        expect(body.error.message).toContain('users:create');
    });
});
