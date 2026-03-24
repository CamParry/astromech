/**
 * API Route Handler
 *
 * Delegates all requests to the Hono app after stripping the base API path.
 * Mounted at `${apiRoute}/[...path]` by Astromech's route registration.
 *
 * The Astro catch-all provides `params.path` as the portion after the base,
 * e.g. for `/api/cms/collections/posts` → params.path = `collections/posts`.
 * We reconstruct an absolute path so Hono's router matches correctly.
 */

import type { APIRoute } from 'astro';
import { app } from '@/api/index.js';

export const prerender = false;

export const ALL: APIRoute = ({ params, request }) => {
    const path = `/${params.path ?? ''}`;
    const original = new URL(request.url);
    const rewritten = new URL(path + original.search, original);
    return app.fetch(new Request(rewritten, request));
};
