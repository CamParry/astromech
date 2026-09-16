/**
 * Creates the application and establishes the request scope. Creation happens
 * per request rather than at module scope because Workers forbid I/O outside a
 * request context.
 */

import type { MiddlewareHandler } from 'astro';
import { rawConfig } from 'virtual:astromech/config';
import { createAstromech } from '@/astromech';
import { assertAuthSecret } from '@/auth/better-auth';
import { runWithRequest } from '@/request-context/request-context';

export const onRequest: MiddlewareHandler = async (context, next) => {
    // Before the application is created, so a site missing its secret serves
    // nothing. A page prerendered at build time signs no session, so the build
    // does not need the secret.
    if (!context.isPrerendered) assertAuthSecret();
    const app = await createAstromech({ config: rawConfig });
    // The Node deployment has no external cron, so the serving integration is
    // what starts the in-process ticker. A no-op on Workers.
    await app.startScheduler();

    return runWithRequest(context.request, () => next());
};

export default onRequest;
