/**
 * Plugin RPC and raw routes at `/api/plugins/*`, mounted before `requireAuth`.
 * RPC calls a service method through the scoped handle, which enforces its
 * `access`; a raw route (binary, multipart, streaming) goes through `enforceAccess`.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ResolvedPluginIdentity, ServiceMethodAccess } from '@/types/index';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { resolveAccess } from '@/permissions/access';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    createPluginContext,
    getPluginRawRoutes,
} from '@/plugins/runtime/plugin-runtime';
import { scopedServices } from '@/policies/scoped-services';
import { optionalAuth } from '@/transport/http/middleware/auth';
import { forbidden, notFound, unauthorized } from '@/transport/http/middleware/errors';

type PluginEnv = { Variables: AuthVariables };

/**
 * Enforce a raw route's declared access. Returns a denial Response, or null to
 * proceed. RPC methods are checked by `scopedServices(ctx).plugins` instead.
 */
function enforceAccess(
    c: Context<PluginEnv>,
    access: ServiceMethodAccess<never>,
    identity: ResolvedPluginIdentity
): Response | null {
    const resolved = resolveAccess(access, undefined, identity.permissionNamespace);
    if (resolved.kind === 'public') return null;

    if (c.var.ctx.user === null) return unauthorized(c);
    if (resolved.kind === 'authenticated') return null;

    if (!permissionsFor(c.var.ctx.role).allowsAccess(resolved)) return forbidden(c);
    return null;
}

/**
 * Build the plugins router from the registered plugins. Called from
 * `createHttpApp`, after `registerPlugins`, so the raw routes it reads exist.
 */
export function createPluginsRouter(): Hono<PluginEnv> {
    const router = new Hono<PluginEnv>();

    router.use('*', optionalAuth);

    // Raw escape-hatch routes, registered before the RPC catch-all.
    // Not in a route table: the verb and path are plugin-declared, the handler
    // takes a Web `Request`, and access is `PluginAccess` rather than a contract
    // permission — so `scopedServices` has nothing to scope.
    for (const { identity, route } of getPluginRawRoutes()) {
        const method = (route.method ?? 'GET').toUpperCase();
        const path = `/${identity.serviceKey}${route.path}`;
        router.on(method, path, (c) => {
            const denied = enforceAccess(c, route.access, identity);
            if (denied) return denied;
            return route.handler(
                c.req.raw,
                createPluginContext(identity, c.var.ctx),
                c.req.param()
            );
        });
    }

    // RPC: POST /plugins/{serviceKey}/{method}
    // Not in a route table: the method id is two path params resolved at request
    // time against the plugin service registry.
    router.post('/:name/:method', (c) =>
        answerPluginMethod(c, c.req.param('name'), c.req.param('method'))
    );

    return router;
}

/**
 * Call one plugin method as `c.var.ctx` and answer its raw result, the one
 * answer both `POST /plugins/:name/:method` and `POST /rpc/plugins.*` give.
 * Access is the scoped handle's: a refusal reaches `onError`, 401 without a
 * session and 403 with one. An unparseable body is no argument.
 */
export async function answerPluginMethod(
    c: Context<PluginEnv>,
    name: string,
    method: string
): Promise<Response> {
    const plugin = scopedServices(c.var.ctx).plugins[name];
    if (plugin === undefined) return notFound(c, `Plugin "${name}" not found`);
    const call = plugin[method];
    if (call === undefined) {
        return notFound(c, `Plugin method "${name}.${method}" not found`);
    }

    const body: unknown = await c.req.json().catch(() => undefined);
    const result = await call(body);
    // Built directly: c.json's generic chokes on the recursive JsonValue type.
    return new Response(JSON.stringify(result ?? null), {
        headers: { 'Content-Type': 'application/json' },
    });
}
