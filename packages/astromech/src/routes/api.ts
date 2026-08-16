/** The Astro entrypoint for the API catch-all: hand the request to the app. */

import type { APIRoute } from 'astro';
import { getAstromech } from '@/boot/application';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => (await getAstromech()).fetch(request);
