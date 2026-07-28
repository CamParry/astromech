/**
 * Plugin entry types over the SINGLE entries router.
 *
 * There is no per-plugin entries mount any more: a plugin entry type is served
 * by `/entries` like any other, addressed by its QUALIFIED id
 * (`widgets/widget`), URL-encoded into the `:type` segment. Two surfaces:
 *  1. Auth/permission matrix + CRUD. A stub middleware injects `user`/`role`
 *     (Better Auth sessions are out of scope), so the test focuses on the
 *     permission DERIVED from the qualified id, end-to-end against the real DB.
 *     `entry:*` must not reach a plugin entry — that would be an escalation.
 *  2. The composed `pluginsRouter` no longer serves an entries subtree, while
 *     its `public` RPC method stays reachable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { createEntriesRouter } from '@/transport/http/routes/entries.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { AstromechConfig, PluginDefinition, Role, User } from '@/types/index.js';

const widgetsPlugin: PluginDefinition = {
    package: 'widgets',
    service: {
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

/** The qualified id, URL-encoded for the `:type` path segment. */
const WIDGET = encodeURIComponent('widgets/widget');

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Mount the entries router in isolation, with an injected role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/entries/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', role);
        return next();
    });
    app.route('/entries', createEntriesRouter());
    return app;
}

describe('plugin entry types on the entries router — permission matrix + CRUD', () => {
    beforeEach(async () => {
        await createTestDb();
        setupTestConfig(configWithWidgets());
    });

    it('403 for a plugin entry type when the role only holds entry:*', async () => {
        // The escalation this derivation exists to prevent.
        const app = mountedApp(roleWith(['entry:*']));
        const res = await app.request(`/entries/${WIDGET}`);
        expect(res.status).toBe(403);
    });

    it('404 on an unknown qualified type even with a broad grant', async () => {
        const app = mountedApp(roleWith(['*']));
        const res = await app.request(`/entries/${encodeURIComponent('widgets/nope')}`);
        expect(res.status).toBe(404);
    });

    it('404 on the BARE type — a plugin type is only addressable qualified', async () => {
        const app = mountedApp(roleWith(['*']));
        const res = await app.request('/entries/widget');
        expect(res.status).toBe(404);
    });

    it('round-trips list/create/get/update/delete with a scoped grant', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));

        const empty = await app.request(`/entries/${WIDGET}`);
        expect(empty.status).toBe(200);
        expect(((await empty.json()) as { data: unknown[] }).data).toEqual([]);

        const created = await app.request(`/entries/${WIDGET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'W1',
                fields: { label: 'hi' },
                status: 'published',
            }),
        });
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as {
            data: { id: string; type: string };
        };
        const id = createdBody.data.id;
        // The entries service stores and returns the qualified id verbatim.
        expect(createdBody.data.type).toBe('widgets/widget');

        const got = await app.request(`/entries/${WIDGET}/${id}`);
        expect(got.status).toBe(200);
        expect(((await got.json()) as { data: { id: string } }).data.id).toBe(id);

        const updated = await app.request(`/entries/${WIDGET}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'W2' }),
        });
        expect(updated.status).toBe(200);
        expect(((await updated.json()) as { data: { title: string } }).data.title).toBe(
            'W2'
        );

        const deleted = await app.request(`/entries/${WIDGET}/${id}`, {
            method: 'DELETE',
        });
        expect(deleted.status).toBe(200);
    });

    it('allows the broad plugin wildcard grant', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:*']));
        const res = await app.request(`/entries/${WIDGET}`);
        expect(res.status).toBe(200);
    });

    it('GET list ?full=true — 403 when role lacks entry:read:full', async () => {
        // plugin:widgets:entry:widget:* grants type-level read but not the
        // cross-cutting entry:read:full capability
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request(`/entries/${WIDGET}?full=true`);
        expect(res.status).toBe(403);
    });

    it('GET list ?full=true — 200 when role has entry:read:full via entry:*', async () => {
        // entry:* trailing wildcard covers entry:read:full
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request(`/entries/${WIDGET}?full=true`);
        expect(res.status).toBe(200);
    });

    it('GET list ?full=true — 200 when role has entry:read:full via *', async () => {
        // * (admin) covers everything
        const app = mountedApp(roleWith(['*']));
        const res = await app.request(`/entries/${WIDGET}?full=true`);
        expect(res.status).toBe(200);
    });

    it('GET list without full — 200 regardless of entry:read:full capability', async () => {
        // No full flag → no capability check; passes as public read
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request(`/entries/${WIDGET}`);
        expect(res.status).toBe(200);
    });

    it('GET :id ?full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        // Create an entry first so we have an id to fetch
        const created = await app.request(`/entries/${WIDGET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'FullTest', fields: { label: 'test' } }),
        });
        const { data } = (await created.json()) as { data: { id: string } };
        const res = await app.request(`/entries/${WIDGET}/${data.id}?full=true`);
        expect(res.status).toBe(403);
    });

    it('GET :id ?full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const created = await app.request(`/entries/${WIDGET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'FullTest2', fields: { label: 'test2' } }),
        });
        const { data } = (await created.json()) as { data: { id: string } };
        const res = await app.request(`/entries/${WIDGET}/${data.id}?full=true`);
        expect(res.status).toBe(200);
    });

    it('POST :type/query full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request(`/entries/${WIDGET}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full: true }),
        });
        expect(res.status).toBe(403);
    });

    it('POST :type/query full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request(`/entries/${WIDGET}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full: true }),
        });
        expect(res.status).toBe(200);
    });

    it('POST /query full=true — 403 when role lacks entry:read:full', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*']));
        const res = await app.request('/entries/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'widgets/widget', full: true }),
        });
        expect(res.status).toBe(403);
    });

    it('POST /query full=true — 200 when role has entry:*', async () => {
        const app = mountedApp(roleWith(['plugin:widgets:entry:widget:*', 'entry:*']));
        const res = await app.request('/entries/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'widgets/widget', full: true }),
        });
        expect(res.status).toBe(200);
    });

    it('POST /query — 403 for a plugin type when the role only holds entry:*', async () => {
        const app = mountedApp(roleWith(['entry:*']));
        const res = await app.request('/entries/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'widgets/widget' }),
        });
        expect(res.status).toBe(403);
    });
});

describe('composed pluginsRouter — no entries subtree', () => {
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

    it('no longer serves a per-plugin entries route', async () => {
        const router = await freshPluginsRouter();
        const res = await router.request('/widgets/entries/widget');
        expect(res.status).toBe(404);
    });

    it('keeps the public RPC method reachable', async () => {
        const router = await freshPluginsRouter();
        const res = await router.request('/widgets/ping', { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toBe('pong');
    });
});
