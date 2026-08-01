/**
 * Astromech Middleware
 *
 * Resolves the session ONCE per request, populates context locals, and
 * establishes the request-scoped context every server-side read of the current
 * user goes through. Auth routing is handled client-side by the SPA.
 */

import type { MiddlewareHandler } from 'astro';
import { resolveSessionUser } from '@/users/index.js';
import { runWithContext } from '@/context/index.js';

export const onRequest: MiddlewareHandler = async (context, next) => {
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
