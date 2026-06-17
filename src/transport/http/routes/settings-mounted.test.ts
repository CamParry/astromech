/**
 * The settings router (`GET/PUT /settings/:key`) over the real composed Hono
 * app + Local API + DB.
 *
 * Regression coverage for two bugs that left plugin settings pages (e.g. the
 * menus editor) empty in the admin:
 *  1. Keys embed a path with slashes (`plugin:<ns>:/menus/main`), so an
 *     unencoded key splits into multiple path segments and misses the
 *     single-segment `/:key` route. The Client must percent-encode the key;
 *     here we assert the route matches the encoded form and 404s the raw one.
 *  2. The route must read with `full: true` — settings are private by default,
 *     and an authenticated admin (guarded by `settings:read`) needs the full
 *     shape, not the public-stripped one, or private keys come back `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@/test/harness.js';
import { Astromech } from '@/transport/local/index.js';
import { settingsRouter } from '@/transport/http/routes/settings.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { Role, User } from '@/types/index.js';

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Mount the real settings router behind a stub that injects user + role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/settings/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', role);
        return next();
    });
    app.route('/settings', settingsRouter);
    return app;
}

// A private, slashed, per-locale key exactly like a plugin settings page.
const KEY = 'plugin:astromech-menus:/menus/main:en';
const VALUE = { items: [{ _id: 'a', label: 'Home', url: '/' }] };

describe('settings router — private slashed keys (plugin settings pages)', () => {
    beforeEach(async () => {
        await createTestDb();
        // makeTestConfig declares no public settings pages → every key is private.
        setupTestConfig(makeTestConfig());
        await Astromech.settings.set(KEY, VALUE);
    });

    it('returns the private value for an authenticated admin (full shape)', async () => {
        const app = mountedApp(roleWith(['settings:read']));
        const res = await app.request(`/settings/${encodeURIComponent(KEY)}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { key: string; value: unknown } };
        expect(body.data.value).toEqual(VALUE);
    });

    it('404s when the slashed key is not percent-encoded (route is single-segment)', async () => {
        const app = mountedApp(roleWith(['settings:read']));
        const res = await app.request(`/settings/${KEY}`);
        expect(res.status).toBe(404);
    });

    it('403s without settings:read', async () => {
        const app = mountedApp(roleWith([]));
        const res = await app.request(`/settings/${encodeURIComponent(KEY)}`);
        expect(res.status).toBe(403);
    });
});
