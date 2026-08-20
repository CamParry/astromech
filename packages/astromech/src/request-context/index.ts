/**
 * Server-side request context: the current `Request`, held in an
 * `AsyncLocalStorage` store so concurrent requests never observe each
 * other's identity. No setter — a setter is what let identity leak before.
 */

export type { RequestContext } from '@/request-context/request-context';
export {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
    runWithContext,
    runWithRequest,
} from '@/request-context/request-context';
