/**
 * Request-scoped identity, held in an `AsyncLocalStorage` store. Service-free:
 * importable from modules that load before `virtual:astromech/config` resolves.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role, User } from '@/types/index';

export type RequestContext = {
    user: User | null;
    role: Role | null;
};

declare global {
    var __astromechRequestContext: AsyncLocalStorage<RequestContext> | undefined;
}

/**
 * The store lives on globalThis (mirrors the db/entry-storage registries): the
 * package has multiple bundle entry points, so a second copy of this module in
 * another chunk would otherwise be a second, EMPTY store.
 */
function store(): AsyncLocalStorage<RequestContext> {
    if (!globalThis.__astromechRequestContext) {
        globalThis.__astromechRequestContext = new AsyncLocalStorage<RequestContext>();
    }
    return globalThis.__astromechRequestContext;
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
