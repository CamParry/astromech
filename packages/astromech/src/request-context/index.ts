/**
 * Server-side request context
 *
 * The current `Request` held in an `AsyncLocalStorage` store, so two requests
 * being served concurrently in one process can never observe each other's
 * identity — the failure mode of the module-level variable this replaced.
 *
 * A scope is established by whichever layer reaches the request first: the Astro
 * middleware for page/SSR requests, or the Hono app's root middleware when it
 * serves one. Identity resolves from the request on the first ask and caches for
 * the rest of it, so a request that never asks costs no session queries.
 *
 * A missing store means "no identity", NOT "the previous request's identity".
 * Outside a scope — the CLI, MCP, cron ticks, tests — `getCurrentUser()`
 * returns `null` without touching Better Auth or the database. There is
 * deliberately no setter: a setter is what made identity leak across requests.
 *
 * The store itself lives in `request-context/request-context.ts`, which imports
 * nothing from the runtime at module scope, so anything loaded during Astro's
 * plain-Node config load reaches it without dragging a registry in.
 */

export type { RequestContext } from '@/request-context/request-context';
export {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
    runWithContext,
    runWithRequest,
} from '@/request-context/request-context';
