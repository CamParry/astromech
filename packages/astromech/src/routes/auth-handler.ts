import { getAuth } from '@/users/index';
import type { APIRoute } from 'astro';

export const ALL: APIRoute = ({ request }) => getAuth().handler(request);
