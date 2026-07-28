/**
 * Plugin RPC + raw routes — mounted at `/api/plugins/*`.
 *
 * RPC: `POST /plugins/{serviceKey}/{method}` calls a plugin's declared service
 * method (JSON in/out). Raw routes (binary/multipart/streaming escape hatch)
 * mount at `/plugins/{serviceKey}{route.path}` and receive a Web-standard
 * Request via a thin wrapper (the plugin never touches Hono).
 *
 * The route segment is the plugin's service key (`acmeSeo`), not its namespace
 * (`acme_seo`), so that the HTTP client can put its property key straight into
 * the URL: `serviceKey` is derived from `namespace` lossily, and mounting on
 * the namespace would force the client to invert that derivation. Everything
 * below the routing layer — permissions, table prefixes — still keys on the
 * namespace, reached through the resolved identity.
 *
 * A plugin's ENTRY types are not served here. They live on the single entries
 * router at `/entries/{qualified type}` like every other entry type, which
 * derives `plugin:{ns}:entry:{type}:{action}` from the qualified id itself.
 *
 * Every method/route declares `access`; this router enforces it against the
 * resolved session. It mounts BEFORE the app-wide `requireAuth`, so `public`
 * methods work without a session.
 */

import { Hono } from 'hono';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import { optionalAuth } from '@/transport/http/middleware/auth.js';
import { forbidden, notFound, unauthorized } from '@/transport/http/middleware/errors.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginRawRoutes,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime.js';
import { withPermissions } from '@/policies/with-permissions.js';
import { resolvePluginPermission } from '@/plugins/runtime/plugin-identity.js';
import type { Context } from 'hono';
import type {
    Permission,
    PluginAccess,
    PluginContext,
    ResolvedPluginIdentity,
} from '@/types/index.js';

type PluginEnv = { Variables: Partial<AuthVariables> };

export const pluginsRouter = new Hono<PluginEnv>();

pluginsRouter.use('*', optionalAuth);

/** Enforce a method/route's declared access. Returns a denial Response, or null to proceed. */
function enforceAccess(
    c: Context<PluginEnv>,
    access: PluginAccess,
    identity: ResolvedPluginIdentity
): Response | null {
    if (access === 'public') return null;

    const user = c.var.user;
    if (!user) return unauthorized(c);
    if (access === 'authenticated') return null;

    const permissions = withPermissions(c.var.role);
    const permission = resolvePluginPermission(
        identity.permissionNamespace,
        access.permission
    ) as Permission;
    if (!permissions.allows(permission)) return forbidden(c);
    return null;
}

// ── Raw escape-hatch routes (registered before the RPC catch-all) ──────────
for (const { identity, route } of getPluginRawRoutes()) {
    const method = (route.method ?? 'GET').toUpperCase();
    const path = `/${identity.serviceKey}${route.path}`;
    pluginsRouter.on(method, path, (c) => {
        const denied = enforceAccess(c, route.access, identity);
        if (denied) return denied;
        return route.handler(
            c.req.raw,
            createPluginContext(identity, c.var.user ?? null)
        );
    });
}

// ── RPC: POST /plugins/{serviceKey}/{method} ───────────────────────────────
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

    const denied = enforceAccess(c, serviceMethod.access, identity);
    if (denied) return denied;

    const input = await c.req.json().catch(() => undefined);
    const result = await (
        serviceMethod.handler as (i: unknown, c: PluginContext) => unknown
    )(input, createPluginContext(identity, c.var.user ?? null));
    // Build the JSON Response directly: c.json's generic chokes on the
    // recursive JsonValue type. RPC returns the raw handler result.
    return new Response(JSON.stringify(result ?? null), {
        headers: { 'Content-Type': 'application/json' },
    });
});
