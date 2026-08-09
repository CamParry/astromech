/**
 * Manifest RPC route
 *
 * `POST /rpc/{method id}` calls any service method the method manifest declares:
 * the id addresses the method, the JSON body is its argument object, and
 * `buildScopedDispatch` supplies the call already scoped to the caller's role. A
 * method the dispatcher cannot build is refused with the reason it declares, so
 * `media.upload` fails as binary input rather than as a generic bad request.
 *
 * An id containing a slash (a plugin entry type's qualified id) must be
 * percent-encoded, exactly as `/settings/:key` requires of a slashed key.
 *
 * Mounted after `requireAuth`: the role is what the dispatch is built from, and
 * a session-scoped method takes its subject from the request context.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { PermissionDeniedError } from '@/errors/index';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import { dispatchArgs } from '@/transport/tools/dispatch';
import { resolveScopedMethod } from '@/transport/tools/scoped-tools';
import type { ManifestMethod } from '@/types/index';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// POST /rpc/:id
// ============================================================================

router.post('/:id', async (c) => {
    const id = c.req.param('id');
    const resolved = resolveScopedMethod(id, c.var.role);
    if (resolved === undefined) return notFound(c, `Method '${id}' not found`);

    const { method, dispatch } = resolved;
    if (!dispatch.ok)
        return badRequest(c, `Method '${id}' is not callable: ${dispatch.reason}`);

    const body = await c.req.json().catch(() => undefined);
    // The manifest carries the contract's input as JSON Schema, so it is read
    // back into Zod to parse with rather than restated here.
    const schema = z.fromJSONSchema(dispatch.tool.inputSchema);
    const parsed = schema.safeParse(callArgs(method, body));
    if (!parsed.success) return fromZodError(c, parsed.error);

    try {
        const result = await dispatch.tool.invoke(parsed.data as Record<string, unknown>);
        return c.json({ data: result ?? null });
    } catch (error) {
        // The scoped handle refuses by throwing, carrying the permission or the
        // session-scoped subject it wanted; every other error is left to onError.
        if (error instanceof PermissionDeniedError) return forbidden(c, error.message);
        throw error;
    }
});

/**
 * The argument object to validate: the JSON body, read through `dispatchArgs`
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
