/** The peer address Astro saw for a request, for the handler and the middleware. */

import type { APIContext } from 'astro';
import { astroReadsForwardedFor } from 'virtual:astromech/config';

/**
 * Astro's `clientAddress`, unless Astro may have taken it from a client-sent
 * `x-forwarded-for`: `security.allowedDomains` is set and the request carries
 * the header. Without the header, Astro's address is the connection's on Node.
 * Astro throws when the adapter has none.
 */
export function readRemoteAddress(context: APIContext): string | undefined {
    if (astroReadsForwardedFor && context.request.headers.has('x-forwarded-for')) {
        return undefined;
    }
    try {
        return context.clientAddress;
    } catch {
        return undefined;
    }
}
