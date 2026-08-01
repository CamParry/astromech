/**
 * Server-side request context
 *
 * Per-request identity (user + role) held in an `AsyncLocalStorage` store, so
 * two requests being served concurrently in one process can never observe each
 * other's identity — the failure mode of the module-level variable this
 * replaced.
 *
 * The context is established by whichever layer reaches the request first: the
 * Astro middleware for page/SSR requests, or the Hono `requireAuth`/
 * `optionalAuth` middleware when the API app is mounted on its own. Whoever is
 * second reuses the store rather than resolving the session again.
 *
 * A missing store means "no identity", NOT "the previous request's identity".
 * Outside a `runWithContext` call — the CLI, MCP, cron ticks, tests —
 * `getCurrentUser()` returns `null`. There is deliberately no setter: a setter
 * is what made identity leak across requests.
 *
 * The database instance is accessed via getDb() from the registry. Config is
 * accessed via the virtual module import.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import config from 'virtual:astromech/config';
import { getDb } from '@/database/registry.js';
import type { Role, User } from '@/types/index.js';

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
 * another chunk would otherwise be a second, EMPTY store — the middleware would
 * write into one while the services read the other and saw no user at all.
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

export function getCurrentUser(): User | null {
    return store().getStore()?.user ?? null;
}

export function getCurrentRole(): Role | null {
    return store().getStore()?.role ?? null;
}

export function getServerContext() {
    return {
        db: getDb(),
        config,
        user: getCurrentUser(),
    };
}
