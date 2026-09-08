/**
 * Manifest RPC route
 *
 * `POST /rpc/{method id}` calls any service method the manifest declares: the
 * id addresses the method, the JSON body is its argument object, and
 * `buildScopedDispatch` supplies the call already scoped to the caller's role.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ManifestMethod } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { PermissionDeniedError } from '@/errors/permission';
import { ValidationError } from '@/errors/validation';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import { dispatchArgs } from '@/transport/tools/dispatch';
import { resolveScopedMethod } from '@/transport/tools/scoped-tools';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

router.post('/:id', async (c) => {
    const id = c.req.param('id');
    const resolved = resolveScopedMethod(id, c.var.role);
    if (resolved === undefined) return notFound(c, `Method '${id}' not found`);

    const { method, dispatch } = resolved;
    if (!dispatch.ok)
        return badRequest(c, `Method '${id}' is not callable: ${dispatch.reason}`);

    const body = await c.req.json().catch(() => undefined);

    try {
        const result = await dispatch.tool.invoke(callArgs(method, body));
        return c.json({ data: result ?? null });
    } catch (error) {
        // The scoped handle refuses by throwing, carrying the permission or the
        // session-scoped subject it wanted; every other error is left to onError.
        if (error instanceof PermissionDeniedError) return forbidden(c, error.message);
        // The method parses its own input. The RPC body IS the argument object,
        // so there is no body key to rebase the field paths against.
        if (error instanceof ValidationError && error.fields === undefined) {
            return fromZodError(c, error);
        }
        throw error;
    }
});

/**
 * The argument object to call with: the JSON body, read through `dispatchArgs`
 * so an entries method gets the type its id already names rather than asking
 * the caller to repeat it.
 */
function callArgs(method: ManifestMethod, body: unknown): Record<string, unknown> {
    const args =
        typeof body === 'object' && body !== null && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : {};
    return dispatchArgs(method, args);
}

export { router as rpcRouter };
