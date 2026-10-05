/**
 * Security Routes
 *
 * The block list and allow list over `security.*`, every route behind the
 * `security:manage` permission the methods declare.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { securityDefinition } from '@/security/service';
import { SECURITY_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

mountRestRoutes(router, {
    catalogue: securityDefinition.catalogue,
    specs: SECURITY_ROUTE_SPECS,
});

export { router as securityRouter };
