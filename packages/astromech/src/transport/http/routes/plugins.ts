/**
 * Plugin RPC and raw routes at `/api/plugins/*`, mounted before `requireAuth`.
 * RPC calls a service method through the scoped handle, which enforces its
 * `access`; a raw route (binary, multipart, streaming) goes through `enforceAccess`.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ResolvedPluginIdentity, ServiceMethodAccess } from '@/types/index';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { PermissionDeniedError } from '@/errors/permission';
import { resolveAccess } from '@/permissions/access';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginRawRoutes,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import { scopedServices } from '@/policies/scoped-services';
import { getClientAddress } from '@/transport/http/client-address';
import { optionalAuth } from '@/transport/http/middleware/auth';
import { forbidden, notFound, unauthorized } from '@/transport/http/middleware/errors';

type PluginEnv = { Variables: Partial<AuthVariables> };

export const pluginsRouter = new Hono<PluginEnv>();

pluginsRouter.use('*', optionalAuth);

/**
 * Enforce a raw route's declared access. Returns a denial Response, or null to
 * proceed. RPC methods are checked by `scopedServices(role).plugins` instead.
 */
function enforceAccess(
    c: Context<PluginEnv>,
    access: ServiceMethodAccess<never>,
    identity: ResolvedPluginIdentity
): Response | null {
    const resolved = resolveAccess(access, undefined, identity.permissionNamespace);
    if (resolved.kind === 'public') return null;

    const user = c.var.user;
    if (!user) return unauthorized(c);
    if (resolved.kind === 'authenticated') return null;

    const permissions = permissionsFor(c.var.role);
    if (!permissions.allows(resolved.permission)) return forbidden(c);
    return null;
}

// Raw escape-hatch routes, registered before the RPC catch-all.
// Not in a route table: the verb and path are plugin-declared, the handler
// takes a Web `Request`, and access is `PluginAccess` rather than a contract
// permission — so `scopedServices` has nothing to scope.
for (const { identity, route } of getPluginRawRoutes()) {
    const method = (route.method ?? 'GET').toUpperCase();
    const path = `/${identity.serviceKey}${route.path}`;
    pluginsRouter.on(method, path, (c) => {
        const denied = enforceAccess(c, route.access, identity);
        if (denied) return denied;
        return route.handler(
            c.req.raw,
            createPluginContext(
                identity,
                c.var.user ?? null,
                c.var.role ?? null,
                getClientAddress(c)
            )
        );
    });
}

// RPC: POST /plugins/{serviceKey}/{method}
// Not in a route table: the method id is two path params resolved at request
// time against the plugin service registry, and the handler's result is
// returned unenveloped. Access is checked by the scoped handle.
pluginsRouter.post('/:name/:method', async (c) => {
    const name = c.req.param('name');
    const method = c.req.param('method');

    // Resolve the identity first, then reach the registry through it — the
    // service registry keys on the namespace, and the segment is the service key.
    const identity = getPluginIdentity(name);
    if (!identity) return notFound(c, `Plugin "${name}" not found`);

    const serviceMethod = getPluginServiceMethods().get(identity.namespace)?.[method];
    if (!serviceMethod) {
        return notFound(c, `Plugin method "${name}.${method}" not found`);
    }

    const body = await c.req.json().catch(() => undefined);
    let result: unknown;
    try {
        result = await scopedServices(c.var.role ?? null).plugins[name]?.[method]?.(body);
    } catch (error) {
        if (!(error instanceof PermissionDeniedError)) throw error;
        return c.var.user ? forbidden(c) : unauthorized(c);
    }
    // Build the JSON Response directly: c.json's generic chokes on the
    // recursive JsonValue type. RPC returns the raw handler result.
    return new Response(JSON.stringify(result ?? null), {
        headers: { 'Content-Type': 'application/json' },
    });
});
