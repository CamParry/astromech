import type { APIRoute } from 'astro';
import { handleMediaRequest } from '@/images/handler.js';

export const prerender = false;

export const ALL: APIRoute = ({ params, request }) => {
    const path = params.path ?? '';
    const dot = path.lastIndexOf('.');
    const id = dot >= 0 ? path.slice(0, dot) : path;
    const ext = dot >= 0 ? path.slice(dot + 1) : '';
    const url = new URL(request.url);
    return handleMediaRequest({
        id,
        ext,
        search: url.searchParams,
        origin: url.origin,
        ifNoneMatch: request.headers.get('if-none-match'),
    });
};
