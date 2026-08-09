/**
 * Request-scoped identity, held in an `AsyncLocalStorage` store. Service-free:
 * importable from modules that load before `virtual:astromech/config` resolves.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
// `@/utilities/registry` imports nothing, which is what keeps this module
// service-free and loadable before `virtual:astromech/config` resolves.
import { createRegistry } from '@/utilities/registry';
import type { Role, User } from '@/types/index';

export type RequestContext = {
    user: User | null;
    role: Role | null;
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
    const existing = requestContext.peek();
    if (existing) return existing;
    const created = new AsyncLocalStorage<RequestContext>();
    requestContext.set(created);
    return created;
}

/** Run `fn` with `ctx` as the request context, for `fn` and everything it awaits. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return store().run(ctx, fn);
}

/** The active request context, or undefined when no context is established. */
export function getRequestContext(): RequestContext | undefined {
    return store().getStore();
}

/** The acting user, or null outside a request context. */
export function getCurrentUser(): User | null {
    return store().getStore()?.user ?? null;
}

/** The acting role, or null outside a request context. */
export function getCurrentRole(): Role | null {
    return store().getStore()?.role ?? null;
}
