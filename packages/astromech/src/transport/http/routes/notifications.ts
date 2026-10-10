/**
 * Notifications Routes
 *
 * Session-scoped — every call names the authenticated user, and filtering on
 * that id is the authorization; the four methods declare `sessionScoped`
 * instead of a permission contract, and the scoped handle fills `userId`.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { notificationsDefinition } from '@/notifications/service';
import { NOTIFICATIONS_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

const { catalogue } = notificationsDefinition;

mountRestRoutes(router, { catalogue, specs: NOTIFICATIONS_ROUTE_SPECS });

export { router as notificationsRouter };
