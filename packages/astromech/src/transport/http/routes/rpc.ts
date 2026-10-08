/**
 * Manifest RPC route
 *
 * `POST /rpc/{method id}` calls any service method the manifest declares: the
 * id addresses the method, the JSON body is its argument object (an empty body
 * is none, and a body that is not a JSON object is 400), and
 * `buildScopedDispatch` supplies the call already scoped to the caller. A
 * plugin method answers as `POST /plugins/:name/:method` does.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { optionalAuth } from '@/transport/http/middleware/auth';
import { badRequest, notFound, unauthorized } from '@/transport/http/middleware/errors';
import { answerPluginMethod } from '@/transport/http/routes/plugins';
import { resolveScopedMethod } from '@/transport/tools/scoped-tools';
import { errorResponses } from './error-responses';
import { readArguments } from './json-body';

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

    // An entries method takes its type from the id, which `callMethod` pins.
    const args = await readArguments(c);
    if (args instanceof Response) return args;

    // The scoped handle's refusal and the method's own input failure both reach
    // `onError`: the RPC body IS the argument object, so no field path needs
    // rebasing onto a wire name.
    const result = await dispatch.tool.invoke(args);
    return c.json({ data: result ?? null });
});
// Documented once, as the generic call: each method's own schemas are
// documented at its REST route or plugin path.
router.openAPIRegistry.registerPath({
    method: 'post',
    path: '/{id}',
    operationId: 'rpc.call',
    summary: 'Call any manifest method by id.',
    description:
        'The body is the method’s argument object, and an empty body is no ' +
        'arguments. A core method answers ' +
        '`{ data }` and needs a session; a plugin method answers as ' +
        '`POST /plugins/{serviceKey}/{method}` does: its bare result, and no ' +
        'session when the method is public.',
    request: {
        params: z.object({
            id: z.string().openapi({
                description: 'The method id, as `astromech methods` lists it.',
            }),
        }),
        body: {
            content: {
                'application/json': { schema: z.record(z.string(), z.unknown()) },
            },
        },
    },
    responses: {
        200: {
            description: 'The method’s result.',
            content: {
                'application/json': { schema: z.object({ data: z.unknown() }) },
            },
        },
        ...errorResponses({
            badRequest: [
                'the method cannot be called with a JSON body (binary input, or no input schema)',
                'the body is not a JSON object',
            ],
            session: true,
            permission: true,
            notFound: 'No manifest method has this id.',
            input: true,
        }),
    },
});

export { router as rpcRouter };
