import { auth } from '@/auth/index.js';
import type { APIRoute } from 'astro';

export const ALL: APIRoute = ({ request }) => auth.handler(request);
