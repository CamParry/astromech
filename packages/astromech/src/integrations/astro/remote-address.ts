/** The peer address Astro saw for a request, for the handler and the middleware. */

import type { APIContext } from 'astro';
import { astroReadsForwardedFor } from 'virtual:astromech/config';

/**
 * Astro's `clientAddress`, unless `security.allowedDomains` lets Astro take it
 * from a client-sent `x-forwarded-for`. Astro throws when the adapter has none.
 */
export function readRemoteAddress(context: APIContext): string | undefined {
    if (astroReadsForwardedFor) return undefined;
    try {
        return context.clientAddress;
    } catch {
        return undefined;
    }
}
