/**
 * The request scope: the store holding the `Request` an HTTP transport serves,
 * and the identity resolved from it. Service-free at module scope, so modules
 * that load before `virtual:astromech/config` resolves can import it.
 */

import type { AppContext, Role, User } from '@/types/index';
import { AsyncLocalStorage } from 'node:async_hooks';
// `@/registry` imports nothing, which is what keeps this module
// service-free and loadable before `virtual:astromech/config` resolves.
import { createRegistry } from '@/registry';

export type RequestScope = {
    request: Request;
    /** Filled on the first resolve, reused for the rest of the request. */
    user?: User | null;
    /** Cached from the same resolve. */
    role?: Role | null;
    /** The request's `AppContext`, built once by `currentAppContext()`. */
    app?: AppContext;
    /** The session resolve in flight, so concurrent readers share one. */
    resolving?: Promise<void>;
    /**
     * The connecting address the Hono app reads for an API request. Absent for
     * Astro page requests and trusted callers.
     */
    clientAddress?: string | undefined;
};

const requestScope = createRegistry<AsyncLocalStorage<RequestScope>>('requestScope', {
    required: false,
});

/**
 * The store lives in a registry: the package has multiple bundle entry points,
 * so a second copy of this module in another chunk would otherwise be a second,
 * EMPTY store. Constructed here on first use rather than in the registry.
 */
function store(): AsyncLocalStorage<RequestScope> {
    const existing = requestScope.get();
    if (existing) return existing;
    const created = new AsyncLocalStorage<RequestScope>();
    requestScope.set(created);
    return created;
}

/** Run `fn` inside `scope`, for `fn` and everything it awaits. */
export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
    return store().run(scope, fn);
}

/** The open request scope, or undefined outside one. */
export function getRequestScope(): RequestScope | undefined {
    return store().getStore();
}

/** The acting user, or null outside a request scope. */
export async function getCurrentUser(): Promise<User | null> {
    const scope = store().getStore();
    if (scope === undefined) return null;
    if (scope.user === undefined) await (scope.resolving ??= resolveIdentity(scope));
    return scope.user ?? null;
}

/** The acting role, or null outside a request scope. */
export async function getCurrentRole(): Promise<Role | null> {
    const scope = store().getStore();
    if (scope === undefined) return null;
    if (scope.user === undefined) await (scope.resolving ??= resolveIdentity(scope));
    return scope.role ?? null;
}

/**
 * Resolve the request's session once and cache it on the scope. Imported
 * dynamically: the session module reaches config, auth and the database, none
 * of which resolve when this module is loaded at Astro's config time.
 */
async function resolveIdentity(scope: RequestScope): Promise<void> {
    const { getSession } = await import('@/auth/session');
    const resolved = await getSession(scope.request.headers);
    scope.user = resolved?.user ?? null;
    scope.role = resolved?.role ?? null;
}
