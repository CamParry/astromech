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
 * The store itself lives in `request-context/request-context.ts`, which imports no
 * config: this barrel reads `virtual:astromech/config`, and anything loaded
 * during Astro's plain-Node config load must reach the store without it.
 */

import config from 'virtual:astromech/config';
import { getDb } from '@/database/registry';
import { getCurrentUser } from '@/request-context/request-context';

export type { RequestContext } from '@/request-context/request-context';
export {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
    runWithContext,
} from '@/request-context/request-context';

export function getServerContext() {
    return {
        db: getDb(),
        config,
        user: getCurrentUser(),
    };
}
