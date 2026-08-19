/**
 * The request-scoped store, holding the `Request` identity is derived from.
 * Service-free at module scope: importable from modules that load before
 * `virtual:astromech/config` resolves, so the session module is imported lazily.
 */

import type { Role, User } from '@/types/index';
import { AsyncLocalStorage } from 'node:async_hooks';
// `@/registry` imports nothing, which is what keeps this module
// service-free and loadable before `virtual:astromech/config` resolves.
import { createRegistry } from '@/registry';

export type RequestContext = {
    request: Request;
    /** Filled on the first resolve, reused for the rest of the request. */
    user?: User | null;
    /** Cached from the same resolve; goes away once the role map is computed during config resolution. */
    role?: Role | null;
};

const requestContext = createRegistry<AsyncLocalStorage<RequestContext>>(
    'requestContext',
    { required: false }
);

/**
 * The store lives in a registry slot: the package has multiple bundle entry
 * points, so a second copy of this module in another chunk would otherwise be a
 * second, EMPTY store. Constructed here on first use rather than in the slot.
 */
function store(): AsyncLocalStorage<RequestContext> {
    const existing = requestContext.get();
    if (existing) return existing;
    const created = new AsyncLocalStorage<RequestContext>();
    requestContext.set(created);
    return created;
}

/** Run `fn` with `ctx` as the request context, for `fn` and everything it awaits. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return store().run(ctx, fn);
}

/** Run `fn` with `request` as the request context, resolving identity on demand. */
export function runWithRequest<T>(request: Request, fn: () => Promise<T>): Promise<T> {
    return runWithContext({ request }, fn);
}

/** The active request context, or undefined when no context is established. */
export function getRequestContext(): RequestContext | undefined {
    return store().getStore();
}

/** The acting user, or null outside a request context. */
export async function getCurrentUser(): Promise<User | null> {
    const ctx = store().getStore();
    if (ctx === undefined) return null;
    if (ctx.user === undefined) await resolveIdentity(ctx);
    return ctx.user ?? null;
}

/** The acting role, or null outside a request context. */
export async function getCurrentRole(): Promise<Role | null> {
    const ctx = store().getStore();
    if (ctx === undefined) return null;
    if (ctx.user === undefined) await resolveIdentity(ctx);
    return ctx.role ?? null;
}

/**
 * Resolve the request's session once and cache it on the context. Imported
 * dynamically: the session module reaches config, auth and the database, none
 * of which resolve when this module is loaded at Astro's config time.
 */
async function resolveIdentity(ctx: RequestContext): Promise<void> {
    const { getSession } = await import('@/users/session');
    const resolved = await getSession(ctx.request.headers);
    ctx.user = resolved?.user ?? null;
    ctx.role = resolved?.role ?? null;
}
