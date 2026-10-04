/**
 * Creates the application and establishes the request scope. Creation happens
 * per request rather than at module scope because Workers forbid I/O outside a
 * request context.
 */

import type { MiddlewareHandler } from 'astro';
import { rawConfig } from 'virtual:astromech/config';
import { createAstromech } from '@/astromech';
import { assertAuthSecret } from '@/auth/better-auth';
import { resolveInjectedRoute } from '@/integrations/astro/routes';
import { runInRequestScope } from '@/request-scope/request-scope';
import { PRIVATE_NO_STORE } from '@/transport/http/cache-control';

export const onRequest: MiddlewareHandler = async (context, next) => {
    // Before the application is created, so a site missing its secret serves
    // nothing. A page prerendered at build time signs no session, so the build
    // does not need the secret.
    if (!context.isPrerendered) assertAuthSecret();
    const app = await createAstromech({ config: rawConfig });
    // The Node deployment has no external cron, so the serving integration is
    // what starts the in-process ticker. A no-op on Workers.
    await app.startScheduler();

    const response = await runInRequestScope({ request: context.request }, () => next());

    const route = resolveInjectedRoute(app.config, context.url.pathname);
    if (route === undefined) return response;
    // After the page, since a later `set()` would undo it. Astro warns on any
    // call when the site configures no cache provider.
    if (context.cache.enabled) context.cache.set(false);
    // A media file is public and keeps the media route's own lifetime.
    return route === 'media' ? response : withCacheControl(response, PRIVATE_NO_STORE);
};

export default onRequest;

/** Set `Cache-Control`, copying a response whose headers are immutable. */
function withCacheControl(response: Response, value: string): Response {
    try {
        response.headers.set('Cache-Control', value);
        return response;
    } catch {
        const copy = new Response(response.body, response);
        copy.headers.set('Cache-Control', value);
        return copy;
    }
}
