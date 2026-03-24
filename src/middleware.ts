/**
 * Astromech Middleware
 *
 * Loads the session, populates context locals, and initializes the server
 * context. Auth routing is handled client-side by the SPA.
 */

import type { MiddlewareHandler } from 'astro';
import { auth } from '@/auth/index.js';
import { setCurrentUser } from '@/sdk/server/index.js';

export const onRequest: MiddlewareHandler = async (context, next) => {
    const { request } = context;

    // Load session from Better Auth
    const sessionData = await auth.api.getSession({ headers: request.headers });

    const user = sessionData?.user
        ? {
              id: sessionData.user.id,
              name: sessionData.user.name,
              email: sessionData.user.email,
              emailVerified: sessionData.user.emailVerified,
              image: sessionData.user.image ?? null,
              fields: null,
              createdAt: sessionData.user.createdAt,
              updatedAt: sessionData.user.updatedAt,
          }
        : null;

    context.locals.user = user;
    context.locals.session = sessionData?.session ?? null;

    // Set the current user for the request
    setCurrentUser(user);

    return next();
};

export default onRequest;
