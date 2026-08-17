/**
 * The Astro entrypoint for every pattern the integration injects: hand the
 * request to the app.
 */

import type { APIRoute } from 'astro';
import { getAstromech } from '@/boot/application';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => (await getAstromech()).fetch(request);
