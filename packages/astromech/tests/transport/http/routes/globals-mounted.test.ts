/**
 * Every row of `GLOBALS_ROUTE_SPECS` reaches a handler on the real router.
 *
 * The failure this catches is a row that matches no route — a path Hono orders
 * behind another, or a handler the table never attached. Such a row answers the
 * app's own `Route <method> <path> not found`, which is the one 404 no row may
 * produce; the domain's own 404 ("Global 'site' not found", for a declared
 * global nothing has saved yet) is a handler having run.
 *
 * A plugin global is served by the same routes, addressed by its QUALIFIED key
 * (`seo/settings`) URL-encoded into the `:key` segment.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { adminRole, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { globalsService } from '@/globals/service';
import { GLOBALS_ROUTE_SPECS } from '@/transport/http/routes/http-routes.shared';
import { app, configWithGlobals, put, SEO } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
});

/** One row's request against `key`, with a body every write route accepts. */
async function request(
    key: string,
    spec: (typeof GLOBALS_ROUTE_SPECS)[number]
): Promise<Response> {
    const path = spec.path.replace(':key', key).replace(':versionId', 'v1');
    const method = spec.verb.toUpperCase();
    const body = method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({});
    return app(adminRole).request(`/globals${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body } : {}),
    });
}

/** The app's unknown-route 404, as opposed to a handler's own. */
async function isUnknownRoute(res: Response): Promise<boolean> {
    if (res.status !== 404) return false;
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message?.startsWith('Route ') === true;
}

describe('every route row reaches a handler', () => {
    it.each(GLOBALS_ROUTE_SPECS.map((spec) => [`${spec.verb} ${spec.path}`, spec]))(
        '%s — host global',
        async (_name, spec) => {
            const res = await request(
                'site',
                spec as (typeof GLOBALS_ROUTE_SPECS)[number]
            );
            expect(await isUnknownRoute(res)).toBe(false);
        }
    );

    it.each(GLOBALS_ROUTE_SPECS.map((spec) => [`${spec.verb} ${spec.path}`, spec]))(
        '%s — plugin global',
        async (_name, spec) => {
            const res = await request(SEO, spec as (typeof GLOBALS_ROUTE_SPECS)[number]);
            expect(await isUnknownRoute(res)).toBe(false);
        }
    );
});

describe('the plugin key addresses the plugin global', () => {
    it('404s the BARE key — a plugin global is only addressable qualified', async () => {
        const res = await app().request('/globals/settings?full=true');
        expect(res.status).toBe(404);
    });

    it('404s the unencoded qualified key (the route is single-segment)', async () => {
        // No row matches two segments, so this is the app's own 404 rather than
        // a handler's — the bug percent-encoding the key exists to avoid.
        const res = await app().request('/globals/seo/settings?full=true');
        expect(res.status).toBe(404);
    });

    it('round-trips the qualified key', async () => {
        const written = await app().request(
            `/globals/${SEO}`,
            put({ fields: { titleTemplate: '%s — Site' } })
        );
        expect(written.status).toBe(200);

        const read = await app().request(`/globals/${SEO}?full=true`);
        expect(read.status).toBe(200);
        const body = (await read.json()) as { data: { key: string; fields: unknown } };
        expect(body.data.key).toBe('seo/settings');
        expect(body.data.fields).toEqual({ titleTemplate: '%s — Site' });
        expect(
            await globalsService.get({ key: 'seo/settings', full: true })
        ).not.toBeNull();
    });
});
