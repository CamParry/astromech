/**
 * Astromech Middleware
 *
 * Creates the application on the first request, starts the scheduler, then
 * resolves the session ONCE per request, populates context locals, and
 * establishes the request-scoped context every server-side read of the current
 * user goes through. Auth routing is handled client-side by the SPA.
 *
 * Astro has no runtime hook, so this injected middleware is how Astromech runs
 * in the serving process. Creation is per-request rather than at module scope
 * because Cloudflare Workers forbid I/O outside a request context.
 */

import type { MiddlewareHandler } from 'astro';
import { rawConfig } from 'virtual:astromech/config';
import { createAstromech } from '@/boot/application';
import { resolveSessionUser } from '@/users/index';
import { runWithContext } from '@/request-context/index';

export const onRequest: MiddlewareHandler = async (context, next) => {
    const app = await createAstromech({ config: rawConfig });
    // The Node deployment has no external cron, so the serving integration is
    // what starts the in-process ticker. A no-op on Workers.
    await app.startScheduler();

    const { request } = context;

    const resolved = await resolveSessionUser(request.headers);

    // `locals.user` is now the real user row — custom `fields` and the actual
    // `roleSlug` — rather than a session-shaped stand-in with a hardcoded
    // 'admin' role, and it is the same object the API middleware sees.
    context.locals.user = resolved?.user ?? null;
    context.locals.session = resolved?.session ?? null;

    return runWithContext(
        { user: resolved?.user ?? null, role: resolved?.role ?? null },
        () => next()
    );
};

export default onRequest;
