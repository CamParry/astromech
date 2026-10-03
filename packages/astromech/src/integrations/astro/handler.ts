/**
 * The Astro entrypoint for every pattern the integration injects: hand the
 * request to the app, with the connection's address when Astro's is that.
 */

import type { APIContext, APIRoute } from 'astro';
import { astroReadsForwardedFor } from 'virtual:astromech/config';
import { getAstromech } from '@/astromech';

export const prerender = false;

export const ALL: APIRoute = async (context) =>
    (await getAstromech()).fetch(context.request, {
        remoteAddress: readRemoteAddress(context),
    });

/**
 * Astro's `clientAddress`, unless `security.allowedDomains` lets Astro take it
 * from a client-sent `x-forwarded-for`. Astro throws when the adapter has none.
 */
function readRemoteAddress(context: APIContext): string | undefined {
    if (astroReadsForwardedFor) return undefined;
    try {
        return context.clientAddress;
    } catch {
        return undefined;
    }
}
