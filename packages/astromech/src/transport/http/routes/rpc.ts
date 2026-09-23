/**
 * Manifest RPC route
 *
 * `POST /rpc/{method id}` calls any service method the manifest declares: the
 * id addresses the method, the JSON body is its argument object, and
 * `buildScopedDispatch` supplies the call already scoped to the caller. A
 * plugin method answers as `POST /plugins/:name/:method` does.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { optionalAuth } from '@/transport/http/middleware/auth';
import { badRequest, notFound, unauthorized } from '@/transport/http/middleware/errors';
import { answerPluginMethod } from '@/transport/http/routes/plugins';
import { resolveScopedMethod } from '@/transport/tools/scoped-tools';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// Mounted before `requireAuth`, as the plugin routes are: a public plugin
// method needs no session, and a core method still refuses a request with none.
router.use('*', optionalAuth);

router.post('/:id', async (c) => {
    const id = c.req.param('id');
    const resolved = resolveScopedMethod(id, c.var.ctx);
    if (resolved === undefined) return notFound(c, `Method '${id}' not found`);

    const { method } = resolved;
    if (method.source === 'plugin') {
        return answerPluginMethod(c, method.serviceKey, method.method);
    }
    if (c.var.ctx.user === null || c.var.ctx.role === null) return unauthorized(c);

    const { dispatch } = resolved;
    if (!dispatch.ok)
        return badRequest(c, `Method '${id}' is not callable: ${dispatch.reason}`);

    const body = await c.req.json().catch(() => undefined);

    // The scoped handle's refusal and the method's own input failure both reach
    // `onError`: the RPC body IS the argument object, so no field path needs
    // rebasing onto a wire name.
    const result = await dispatch.tool.invoke(callArgs(body));
    return c.json({ data: result ?? null });
});

/**
 * The argument object to call with: the JSON body when it is an object, else
 * none. An entries method takes its type from the id, which `callMethod` pins.
 */
function callArgs(body: unknown): Record<string, unknown> {
    return typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
}

export { router as rpcRouter };
