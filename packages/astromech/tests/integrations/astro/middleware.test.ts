/**
 * The Astro middleware: it refuses a request in production while Better Auth's
 * secret is unset, before it creates the application, and keeps Astro's route
 * cache off Astromech's own routes.
 */

import type { AstromechConfig, SchedulerDriver } from '@/types/index';
import type { APIContext } from 'astro';
import { expectConsole } from '@tests/console';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getAstromech } from '@/astromech';
import { getMigrationProvider } from '@/database/migration-registry';
import { clearEnvSource, setEnvSource } from '@/env';
import { onRequest } from '@/integrations/astro/middleware';

// The site config the middleware boots, set per test. Read through a getter
// because the mock is built before any test runs.
const site = vi.hoisted(() => ({
    config: undefined as AstromechConfig | undefined,
    migrationNames: null as readonly string[] | null,
    astroReadsForwardedFor: false,
}));

vi.mock('virtual:astromech/config', () => ({
    get rawConfig() {
        return site.config;
    },
    get migrationNames() {
        return site.migrationNames;
    },
    get astroReadsForwardedFor() {
        return site.astroReadsForwardedFor;
    },
}));

const SECRET = 'middleware-test-0123456789abcdef0123';

/** Starts nothing, so a boot here leaves no ticker running. */
const noScheduler: SchedulerDriver = { name: 'none' };

beforeEach(async () => {
    await createTestDb();
    site.config = { ...makeBootConfig(), scheduler: noScheduler };
    site.migrationNames = null;
    site.astroReadsForwardedFor = false;
    clearEnvSource();
    // A secret in the shell running the suite would otherwise satisfy the check.
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
});

afterEach(() => {
    clearEnvSource();
    vi.unstubAllEnvs();
});

type RouteCache = APIContext['cache'] & {
    /** Whether the last `set()` was `set(false)`, which stores nothing. */
    readonly disabled: boolean;
    readonly calls: number;
};

/**
 * Astro's route cache, recording what is set on it. `enabled` is false when the
 * site configures no cache provider, where Astro warns on any `set()`.
 */
function routeCache(enabled = true): RouteCache {
    let disabled = false;
    let calls = 0;
    return {
        enabled,
        set(input) {
            calls++;
            disabled = input === false;
        },
        tags: [],
        options: { tags: [] },
        invalidate: () => Promise.resolve(),
        get disabled() {
            return disabled;
        },
        get calls() {
            return calls;
        },
    };
}

/** The slice of Astro's context the middleware reads. */
function context(
    options: {
        path?: string;
        isPrerendered?: boolean;
        cache?: RouteCache;
        clientAddress?: string;
        headers?: Record<string, string>;
    } = {}
): APIContext {
    const url = new URL(options.path ?? '/', 'http://localhost');
    return {
        request: new Request(url, { headers: options.headers ?? {} }),
        url,
        isPrerendered: options.isPrerendered ?? false,
        cache: options.cache ?? routeCache(),
        clientAddress: options.clientAddress,
    } as unknown as APIContext;
}

function page(): Promise<Response> {
    return Promise.resolve(new Response('page'));
}

/** The response the middleware resolves to. */
async function responseOf(pending: ReturnType<typeof onRequest>): Promise<Response> {
    const response = await pending;
    if (!(response instanceof Response)) {
        throw new Error('the middleware resolved to no response');
    }
    return response;
}

/** The body of the response the middleware resolves to. */
async function bodyOf(pending: ReturnType<typeof onRequest>): Promise<string> {
    return (await responseOf(pending)).text();
}

describe('the Astro middleware', () => {
    it('refuses a request in production without the secret, before creating the application', async () => {
        setEnvSource({ NODE_ENV: 'production' });
        const next = vi.fn(page);

        await expect(onRequest(context(), next)).rejects.toThrow(
            /missing env var: BETTER_AUTH_SECRET.*openssl rand -base64 32/
        );
        expect(next).not.toHaveBeenCalled();
        expect(() => getAstromech()).toThrow(/no instance of Astromech exists/);
    });

    it('refuses a production request when a captcha is configured without its secret', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
        site.config = {
            ...makeBootConfig(),
            scheduler: noScheduler,
            security: { captcha: { provider: 'turnstile', siteKey: 'site-key' } },
        };
        const next = vi.fn(page);

        await expect(onRequest(context(), next)).rejects.toThrow(
            /missing env var: ASTROMECH_CAPTCHA_SECRET.*wrangler secret put/
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('serves a production request with a captcha and its secret', async () => {
        setEnvSource({
            NODE_ENV: 'production',
            BETTER_AUTH_SECRET: SECRET,
            ASTROMECH_CAPTCHA_SECRET: 'captcha-secret',
        });
        site.config = {
            ...makeBootConfig(),
            scheduler: noScheduler,
            security: { captcha: { provider: 'turnstile', siteKey: 'site-key' } },
        };

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('serves a request in production with the secret from the env source', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('serves a request in development without the secret', async () => {
        setEnvSource({ NODE_ENV: 'development' });

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    // A Worker has no file system to read the migrations folder from.
    it('checks the database against the migration names bundled at build time', async () => {
        setEnvSource({ NODE_ENV: 'development' });
        const applied = Object.keys(await getMigrationProvider().getMigrations());
        site.migrationNames = [...applied, '9999_not-applied'];
        expectConsole(
            'error',
            '1 migration has not been applied to this database: 9999_not-applied'
        );

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('prerenders a page at build time without the secret', async () => {
        setEnvSource({ NODE_ENV: 'production' });

        expect(await bodyOf(onRequest(context({ isPrerendered: true }), page))).toBe(
            'page'
        );
    });

    it('boots no application and starts no scheduler for a prerendered page', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
        const start = vi.fn();
        site.config = { ...makeBootConfig(), scheduler: { name: 'spy', start } };

        expect(await bodyOf(onRequest(context({ isPrerendered: true }), page))).toBe(
            'page'
        );
        expect(start).not.toHaveBeenCalled();
        expect(() => getAstromech()).toThrow(/no instance of Astromech exists/);
    });

    it('starts the scheduler for a page rendered on demand', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
        const start = vi.fn();
        site.config = { ...makeBootConfig(), scheduler: { name: 'spy', start } };

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
        expect(start).toHaveBeenCalledOnce();
    });
});

describe('caching on Astromech routes', () => {
    beforeEach(() => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
    });

    it.each([['/cms'], ['/cms/entries/post'], ['/cms/api/entries/post']])(
        'turns the route cache off for %s, after the page set it, and sends private, no-store',
        async (path) => {
            const cache = routeCache();
            const next = (): Promise<Response> => {
                cache.set({ maxAge: 3600 });
                return Promise.resolve(
                    new Response('page', {
                        headers: { 'Cache-Control': 'public, max-age=60' },
                    })
                );
            };

            const response = await responseOf(onRequest(context({ path, cache }), next));

            expect(cache.disabled).toBe(true);
            expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        }
    );

    it('sends private, no-store on a response whose headers are immutable', async () => {
        const next = (): Promise<Response> =>
            Promise.resolve(Response.redirect('http://localhost/cms/login', 302));

        const response = await responseOf(onRequest(context({ path: '/cms' }), next));

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('http://localhost/cms/login');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('turns the route cache off for the media route and keeps its own Cache-Control', async () => {
        const cache = routeCache();
        const next = (): Promise<Response> =>
            Promise.resolve(
                new Response('bytes', {
                    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
                })
            );

        const response = await responseOf(
            onRequest(context({ path: '/_media/abc.jpg', cache }), next)
        );

        expect(cache.disabled).toBe(true);
        expect(response.headers.get('Cache-Control')).toBe(
            'public, max-age=31536000, immutable'
        );
    });

    it('leaves a site page to the site', async () => {
        const cache = routeCache();

        const response = await responseOf(
            onRequest(context({ path: '/cmsx', cache }), page)
        );

        expect(cache.calls).toBe(0);
        expect(response.headers.get('Cache-Control')).toBeNull();
    });

    it('calls no cache method when the site configures no cache provider', async () => {
        const cache = routeCache(false);

        const response = await responseOf(
            onRequest(context({ path: '/cms/api/entries/post', cache }), page)
        );

        expect(cache.calls).toBe(0);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
});

describe('caching on a page that read with a preview token', () => {
    beforeEach(() => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
    });

    /** A page that reads as `read` does while it renders, after a `routeRules` entry set a lifetime. */
    function pageReading(cache: RouteCache, read: () => Promise<unknown>) {
        return async (): Promise<Response> => {
            cache.set({ maxAge: 3600 });
            await read();
            return new Response('page');
        };
    }

    it.each([
        [
            'get',
            () =>
                currentServices.entries.get({
                    type: 'post',
                    id: 'any',
                    previewToken: 'token-from-the-query-string',
                }),
        ],
        [
            'query',
            () =>
                currentServices.entries.query({
                    type: 'post',
                    previewToken: 'token-from-the-query-string',
                }),
        ],
    ])(
        'turns the route cache off and sends private, no-store after a %s',
        async (_label, read) => {
            const cache = routeCache();

            const response = await responseOf(
                onRequest(
                    context({
                        path: '/blog/post?preview=token-from-the-query-string',
                        cache,
                    }),
                    pageReading(cache, read)
                )
            );

            expect(cache.disabled).toBe(true);
            expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        }
    );

    it('leaves the cache to the site for a read without a preview token', async () => {
        const cache = routeCache();
        const read = () => currentServices.entries.query({ type: 'post' });

        const response = await responseOf(
            onRequest(context({ path: '/blog', cache }), pageReading(cache, read))
        );

        expect(cache.disabled).toBe(false);
        expect(response.headers.get('Cache-Control')).toBeNull();
    });
});

describe('the block list on pages', () => {
    const BLOCKED = '203.0.113.7';

    beforeEach(async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
        // Boots the application, so the services can write the block.
        await responseOf(
            onRequest(context({ path: '/cms', clientAddress: BLOCKED }), page)
        );
        await currentServices.security.block({ data: { address: BLOCKED } });
    });

    it('refuses an admin page from a blocked address', async () => {
        const next = vi.fn(page);

        const response = await responseOf(
            onRequest(context({ path: '/cms/entries', clientAddress: BLOCKED }), next)
        );

        expect(response.status).toBe(403);
        expect(await response.text()).toBe('Forbidden');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(next).not.toHaveBeenCalled();
    });

    it('serves an admin page to another address', async () => {
        const response = await responseOf(
            onRequest(
                context({ path: '/cms/entries', clientAddress: '203.0.113.8' }),
                page
            )
        );

        expect(response.status).toBe(200);
    });

    it('refuses an admin page from a blocked address under allowedDomains when the request carries no x-forwarded-for', async () => {
        site.astroReadsForwardedFor = true;

        const response = await responseOf(
            onRequest(context({ path: '/cms/entries', clientAddress: BLOCKED }), page)
        );

        expect(response.status).toBe(403);
    });

    it('knows no address under allowedDomains when the request carries x-forwarded-for', async () => {
        site.astroReadsForwardedFor = true;
        expectConsole('error', 'set `security.trustProxy`');

        const response = await responseOf(
            onRequest(
                context({
                    path: '/cms/entries',
                    clientAddress: BLOCKED,
                    headers: { 'x-forwarded-for': '198.51.100.9' },
                }),
                page
            )
        );

        expect(response.status).toBe(200);
    });

    it('leaves a site page from a blocked address alone', async () => {
        const response = await responseOf(
            onRequest(context({ path: '/blog', clientAddress: BLOCKED }), page)
        );

        expect(response.status).toBe(200);
    });
});

describe('headers on admin pages', () => {
    beforeEach(() => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });
    });

    it("sets frame-ancestors 'self' on an admin page", async () => {
        const response = await responseOf(
            onRequest(context({ path: '/cms/entries/post' }), page)
        );

        expect(response.headers.get('Content-Security-Policy')).toBe(
            "frame-ancestors 'self'"
        );
    });

    it('keeps a policy the page already sent, so both apply', async () => {
        const next = (): Promise<Response> =>
            Promise.resolve(
                new Response('page', {
                    headers: { 'Content-Security-Policy': "default-src 'self'" },
                })
            );

        const response = await responseOf(onRequest(context({ path: '/cms' }), next));

        expect(response.headers.get('Content-Security-Policy')).toBe(
            "default-src 'self', frame-ancestors 'self'"
        );
    });

    it('sets the policy on a response whose headers are immutable', async () => {
        const next = (): Promise<Response> =>
            Promise.resolve(Response.redirect('http://localhost/cms/login', 302));

        const response = await responseOf(onRequest(context({ path: '/cms' }), next));

        expect(response.headers.get('Content-Security-Policy')).toBe(
            "frame-ancestors 'self'"
        );
    });

    it("leaves a site page's frame policy to the site", async () => {
        const response = await responseOf(onRequest(context({ path: '/blog' }), page));

        expect(response.headers.get('Content-Security-Policy')).toBeNull();
        expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('sends no Strict-Transport-Security on an admin page by default', async () => {
        const response = await responseOf(onRequest(context({ path: '/cms' }), page));

        expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('adds HSTS to an admin page when configured', async () => {
        site.config = {
            ...makeBootConfig(),
            scheduler: noScheduler,
            security: { hsts: { maxAge: 600, includeSubDomains: true } },
        };

        const response = await responseOf(onRequest(context({ path: '/cms' }), page));

        expect(response.headers.get('Strict-Transport-Security')).toBe(
            'max-age=600; includeSubDomains'
        );
    });
});
