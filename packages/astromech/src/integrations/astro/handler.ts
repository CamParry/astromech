/**
 * The Astro entrypoint for every pattern the integration injects: hand the
 * request to the app, with the connection's address when Astro's is that.
 */

import type { APIRoute } from 'astro';
import { getAstromech } from '@/astromech';
import { readRemoteAddress } from '@/integrations/astro/remote-address';

export const prerender = false;

export const ALL: APIRoute = async (context) =>
    (await getAstromech()).fetch(context.request, {
        remoteAddress: readRemoteAddress(context),
    });
