/**
 * The mountable entries router (`createEntriesRouter`) under a plugin namespace.
 *
 * Two surfaces are exercised:
 *  1. Auth/permission matrix + CRUD on an isolated mount built with the plugin
 *     options. A stub middleware injects `user`/`role` (Better Auth sessions are
 *     out of scope here), so the test focuses on the factory's permission wiring
 *     and the bare→qualified type transform end-to-end against the real DB.
 *  2. Routing precedence on the real composed `pluginsRouter`: the static
 *     `/{name}/entries/*` segments win over the RPC `/:name/:method` catch-all,
 *     and an unauthenticated request to the entries subtree is rejected (401)
 *     by the explicit `requireAuth` while a `public` RPC method stays reachable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@/test/harness.js';
import { createEntriesRouter } from '@/transport/http/routes/entries.js';
import { getPluginEntryMounts } from '@/plugins/runtime/plugin-runtime.js';
import { qualifyEntryType } from '@/support/entry-types.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { AstromechConfig, PluginDefinition, Role, User } from '@/types/index.js';

const widgetsPlugin: PluginDefinition = {
    package: 'widgets',
    sdk: {
        ping: { access: 'public', handler: () => 'pong' },
    },
    entries: [
        {
            type: 'widget',
            single: 'Widget',
            plural: 'Widgets',
            fields: [{ name: 'label', type: 'text', label: 'Label' }],
        },
    ],
};

function configWithWidgets(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [widgetsPlugin] };
}

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Build the plugin entries mount in isolation, with an injected role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/plugins/widgets/entries/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', role);
        return next();
    });
    app.route(
        '/plugins/widgets/entries',
        createEntriesRouter({
            lookup: (t) => getPluginEntryMounts()[0]?.entryTypes[t],
            qualify: (t) => qualifyEntryType('widgets', t),
            permissionFor: (t, a) => `plugin:widgets:entry:${t}:${a}`,
        })
    );
    return app;
}

describe('plugin entries mount — permission matrix + CRUD', () => {
    beforeEach(async () => {
        await createTestDb();
        setupTestConfig(configWithWidgets());
    });

    it('403 when the role lacks the plugin entry permission', async () => {
        const app = mountedApp(roleWith(['entry:*']));
        const res = await app.request('/plugins/widgets/entries/widget');
        expect(res.status).toBe(403);
    });

    it('404 on an unknown bare type even with a broad grant', async () => {
        const app = mountedApp(roleWith(['*']));
        const res = await app.request('/plugins/widgets/entries/nope');
        expect(res.status).toBe(404);
    });

    it('round-trips list/create/get/update/delete with a scoped grant', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));

        const empty = await app.request('/plugins/widgets/entries/widget');
        expect(empty.status).toBe(200);
        expect(((await empty.json()) as { data: unknown[] }).data).toEqual([]);

        const created = await app.request('/plugins/widgets/entries/widget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'W1', fields: { label: 'hi' }, status: 'published' }),
        });
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as {
            data: { id: string; type: string };
        };
        const id = createdBody.data.id;
        // The entries service stores and returns the qualified id verbatim.
        expect(createdBody.data.type).toBe('widgets/widget');

        const got = await app.request(`/plugins/widgets/entries/widget/${id}`);
        expect(got.status).toBe(200);
        expect(((await got.json()) as { data: { id: string } }).data.id).toBe(id);

        const updated = await app.request(`/plugins/widgets/entries/widget/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'W2' }),
        });
        expect(updated.status).toBe(200);
        expect(((await updated.json()) as { data: { title: string } }).data.title).toBe(
            'W2'
        );

        const deleted = await app.request(`/plugins/widgets/entries/widget/${id}`, {
            method: 'DELETE',
        });
        expect(deleted.status).toBe(200);
    });

    it('allows the broad plugin wildcard grant', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:*']));
        const res = await app.request('/plugins/widgets/entries/widget');
        expect(res.status).toBe(200);
    });

    it('GET list ?full=true — 403 when role lacks entry:read:full', async () => {
        // plugin:widgets:entry:widget:* grants type-level read but not the
        // cross-cutting entry:read:full capability
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request('/plugins/widgets/entries/widget?full=true');
        expect(res.status).toBe(403);
    });

    it('GET list ?full=true — 200 when role has entry:read:full via entry:*', async () => {
        // entry:* trailing wildcard covers entry:read:full
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request('/plugins/widgets/entries/widget?full=true');
        expect(res.status).toBe(200);
    });

    it('GET list ?full=true — 200 when role has entry:read:full via *', async () => {
        // * (admin) covers everything
        const app = mountedApp(roleWith(['*']));
        const res = await app.request('/plugins/widgets/entries/widget?full=true');
        expect(res.status).toBe(200);
    });

    it('GET list without full — 200 regardless of entry:read:full capability', async () => {
        // No full flag → no capability check; passes as public read
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request('/plugins/widgets/entries/widget');
        expect(res.status).toBe(200);
    });

    it('GET :id ?full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        // Create an entry first so we have an id to fetch
        const created = await app.request('/plugins/widgets/entries/widget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'FullTest', fields: { label: 'test' } }),
        });
        const { data } = (await created.json()) as { data: { id: string } };
        const res = await app.request(
            `/plugins/widgets/entries/widget/${data.id}?full=true`
        );
        expect(res.status).toBe(403);
    });

    it('GET :id ?full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const created = await app.request('/plugins/widgets/entries/widget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'FullTest2', fields: { label: 'test2' } }),
        });
        const { data } = (await created.json()) as { data: { id: string } };
        const res = await app.request(
            `/plugins/widgets/entries/widget/${data.id}?full=true`
        );
        expect(res.status).toBe(200);
    });

    it('POST :type/query full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request('/plugins/widgets/entries/widget/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full: true }),
        });
        expect(res.status).toBe(403);
    });

    it('POST :type/query full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request('/plugins/widgets/entries/widget/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full: true }),
        });
        expect(res.status).toBe(200);
    });

    it('POST /query full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request('/plugins/widgets/entries/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'widget', full: true }),
        });
        expect(res.status).toBe(403);
    });

    it('POST /query full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request('/plugins/widgets/entries/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'widget', full: true }),
        });
        expect(res.status).toBe(200);
    });
});

describe('composed pluginsRouter — routing precedence + auth', () => {
    afterEach(() => {
        vi.resetModules();
    });

    async function freshPluginsRouter() {
        await createTestDb();
        setupTestConfig(configWithWidgets());
        // Re-evaluate the module so its import-time mounts read the freshly
        // registered plugin set.
        vi.resetModules();
        const mod = await import('@/transport/http/routes/plugins.js');
        return mod.pluginsRouter;
    }

    it('rejects an unauthenticated request to the entries subtree (401)', async () => {
        const router = await freshPluginsRouter();
        const res = await router.request('/widgets/entries/widget');
        expect(res.status).toBe(401);
    });

    it('keeps the public RPC method reachable (entries mount does not shadow it)', async () => {
        const router = await freshPluginsRouter();
        const res = await router.request('/widgets/ping', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toBe('pong');
    });
});
