/**
 * The Astro middleware: it refuses a request in production while Better Auth's
 * secret is unset, before it creates the application, and keeps Astro's route
 * cache off Astromech's own routes.
 */

import type { AstromechConfig, SchedulerDriver } from '@/types/index';
import type { APIContext } from 'astro';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getAstromech } from '@/astromech';
import { clearEnvSource, setEnvSource } from '@/env';
import { onRequest } from '@/integrations/astro/middleware';

// The site config the middleware boots, set per test. Read through a getter
// because the mock is built before any test runs.
const site = vi.hoisted(() => ({ config: undefined as AstromechConfig | undefined }));

vi.mock('virtual:astromech/config', () => ({
    get rawConfig() {
        return site.config;
    },
}));

const SECRET = 'middleware-test-0123456789abcdef0123';

/** Starts nothing, so a boot here leaves no ticker running. */
const noScheduler: SchedulerDriver = { name: 'none', start: () => undefined };

beforeEach(async () => {
    await createTestDb();
    site.config = { ...makeBootConfig(), scheduler: noScheduler };
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
    options: { path?: string; isPrerendered?: boolean; cache?: RouteCache } = {}
): APIContext {
    const url = new URL(options.path ?? '/', 'http://localhost');
    return {
        request: new Request(url),
        url,
        isPrerendered: options.isPrerendered ?? false,
        cache: options.cache ?? routeCache(),
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

    it('serves a request in production with the secret from the env source', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('serves a request in development without the secret', async () => {
        setEnvSource({ NODE_ENV: 'development' });

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
