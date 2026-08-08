/**
 * Astromech Middleware
 *
 * Boots the runtime on the first request, then resolves the session ONCE per
 * request, populates context locals, and establishes the request-scoped context
 * every server-side read of the current user goes through. Auth routing is
 * handled client-side by the SPA.
 *
 * Astro has no runtime hook, so this injected middleware is the only code
 * Astromech runs in the serving process. Boot is lazy rather than module-scope
 * because Cloudflare Workers forbid I/O outside a request context.
 */

import type { MiddlewareHandler } from 'astro';
import resolvedConfig, { rawConfig } from 'virtual:astromech/config';
import { initRuntime, startScheduler } from '@/boot/boot.js';
import { createRegistry } from '@/utilities/registry.js';
import { resolveSessionUser } from '@/users/index.js';
import { runWithContext } from '@/request-context/index.js';

export const onRequest: MiddlewareHandler = async (context, next) => {
    await ensureBooted();

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

const boot = createRegistry<Promise<void>>('boot', { required: false });

/**
 * The PROMISE is memoised, not its result, so concurrent first requests share
 * one init instead of racing several. A Workers isolate is evicted and replaced,
 * so this runs repeatedly over a deployment's life and has to stay cheap.
 */
function ensureBooted(): Promise<void> {
    const pending = boot.peek();
    if (pending !== null) return pending;

    const started = (async (): Promise<void> => {
        await initRuntime(rawConfig, resolvedConfig);
        // Needs the scheduler driver initRuntime registers, and this is the only
        // booted runtime — it starts one timer, it does not put cron in the
        // request path.
        await startScheduler();
    })();
    boot.set(started);
    return started;
}
