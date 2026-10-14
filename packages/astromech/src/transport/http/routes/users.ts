/**
 * Users Routes
 *
 * CRUD operations for CMS users, every one served from the route table. A
 * caller's access to their own account is the methods' rule
 * (`users/internal/access.ts`), so it holds on every transport.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { usersDefinition } from '@/users/service';
import { USERS_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

mountRestRoutes(router, {
    catalogue: usersDefinition.catalogue,
    specs: USERS_ROUTE_SPECS,
});

export { router as usersRouter };
