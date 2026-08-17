/**
 * Creates the application, resolves the session once per request, and
 * establishes the request-scoped context. Creation happens per request rather
 * than at module scope because Workers forbid I/O outside a request context.
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

    context.locals.user = resolved?.user ?? null;
    context.locals.session = resolved?.session ?? null;

    return runWithContext(
        { user: resolved?.user ?? null, role: resolved?.role ?? null },
        () => next()
    );
};

export default onRequest;
