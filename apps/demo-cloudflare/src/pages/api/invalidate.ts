/**
 * Purge cache tags from Workers Caching, for a signed-in user. Astromech purges
 * nothing itself, and a zone purge through the Cloudflare API does not reach a
 * Worker's cache, so a site purges from inside the Worker, as here. A media
 * item's responses carry `astromech:media:<id>`.
 */

import type { APIRoute } from 'astro';
import { getAstromech } from 'astromech';

export const POST: APIRoute = async (context) => {
    const app = await getAstromech();
    if ((await app.getCurrentUser()) === null) {
        return Response.json({ error: 'Sign in to purge' }, { status: 401 });
    }
    const body: unknown = await context.request.json().catch(() => undefined);
    const tags =
        typeof body === 'object' && body !== null && 'tags' in body
            ? body.tags
            : undefined;
    if (
        !Array.isArray(tags) ||
        tags.length === 0 ||
        !tags.every((tag) => typeof tag === 'string')
    ) {
        return Response.json(
            { error: 'Send { "tags": [...] }, one tag or more' },
            { status: 400 }
        );
    }
    await context.cache.invalidate({ tags });
    return Response.json({ data: { tags } });
};
