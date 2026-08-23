/**
 * Creates the application and establishes the request scope. Creation happens
 * per request rather than at module scope because Workers forbid I/O outside a
 * request context.
 */

import type { MiddlewareHandler } from 'astro';
import { rawConfig } from 'virtual:astromech/config';
import { createAstromech } from '@/astromech';
import { runWithRequest } from '@/request-context/request-context';

export const onRequest: MiddlewareHandler = async (context, next) => {
    const app = await createAstromech({ config: rawConfig });
    // The Node deployment has no external cron, so the serving integration is
    // what starts the in-process ticker. A no-op on Workers.
    await app.startScheduler();

    return runWithRequest(context.request, () => next());
};

export default onRequest;
