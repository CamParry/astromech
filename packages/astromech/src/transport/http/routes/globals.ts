/**
 * Global Routes
 *
 * Every global is served here, addressed by the key the globals service itself
 * uses — bare for a host global, qualified for a plugin's. The routes are rows
 * in `http-routes.ts`.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { globalsDefinition } from '@/globals/service';
import { GLOBALS_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';
import { missingGlobal } from './route-access';

type Env = { Variables: AuthVariables };

/**
 * Build the globals router. There is exactly ONE in production; this is a
 * factory so tests can mount an isolated instance.
 */
export function createGlobalsRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();
    mountRestRoutes(router, {
        catalogue: globalsDefinition.catalogue,
        specs: GLOBALS_ROUTE_SPECS,
        missingTarget: missingGlobal,
    });
    return router;
}

/** The globals router, mounted at `/globals`. Serves every global. */
export const globalsRouter = createGlobalsRouter();
