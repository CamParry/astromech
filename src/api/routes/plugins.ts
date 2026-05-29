/**
 * Plugin RPC + raw routes — mounted at `/api/plugins/*`.
 *
 * RPC: `POST /plugins/{name}/{method}` calls a plugin's declared SDK method
 * (JSON in/out). Raw routes (binary/multipart/streaming escape hatch) mount at
 * `/plugins/{name}{route.path}` and receive a Web-standard Request via a thin
 * wrapper (the plugin never touches Hono).
 *
 * Every method/route declares `access`; this router enforces it against the
 * resolved session. It mounts BEFORE the app-wide `requireAuth`, so `public`
 * methods work without a session.
 */

import { Hono } from 'hono';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { optionalAuth } from '@/api/middleware/auth.js';
import { forbidden, notFound, unauthorized } from '@/api/middleware/errors.js';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginRawRoutes,
    getPluginSdkMethods,
} from '@/core/plugin-runtime.js';
import { can } from '@/core/permissions.js';
import type { Context } from 'hono';
import type { Permission, PluginAccess } from '@/types/index.js';

type PluginEnv = { Variables: Partial<AuthVariables> };

export const pluginsRouter = new Hono<PluginEnv>();

pluginsRouter.use('*', optionalAuth);

/** Enforce a method/route's declared access. Returns a denial Response, or null to proceed. */
function enforceAccess(
    c: Context<PluginEnv>,
    access: PluginAccess,
    name: string
): Response | null {
    if (access === 'public') return null;

    const user = c.var.user;
    if (!user) return unauthorized(c);
    if (access === 'authenticated') return null;

    const role = c.var.role;
    const namespace = getPluginIdentity(name)?.permissionNamespace ?? name;
    const permission = `plugin:${namespace}:${access.permission}` as Permission;
    if (!role || !can(role, permission)) return forbidden(c);
    return null;
}

// ── Raw escape-hatch routes (registered before the RPC catch-all) ──────────
for (const { identity, route } of getPluginRawRoutes()) {
    const method = (route.method ?? 'GET').toUpperCase();
    const path = `/${identity.name}${route.path}`;
    pluginsRouter.on(method, path, (c) => {
        const denied = enforceAccess(c, route.access, identity.name);
        if (denied) return denied;
        return route.handler(c.req.raw, createPluginContext(identity, c.var.user ?? null));
    });
}

// ── RPC: POST /plugins/{name}/{method} ─────────────────────────────────────
pluginsRouter.post('/:name/:method', async (c) => {
    const name = c.req.param('name');
    const method = c.req.param('method');

    const sdkMethod = getPluginSdkMethods().get(name)?.[method];
    if (!sdkMethod) {
        return notFound(c, `Plugin method "${name}.${method}" not found`);
    }

    const denied = enforceAccess(c, sdkMethod.access, name);
    if (denied) return denied;

    const identity = getPluginIdentity(name);
    if (!identity) return notFound(c, `Plugin "${name}" not found`);

    const input = await c.req.json().catch(() => undefined);
    const result = await sdkMethod.handler(input, createPluginContext(identity, c.var.user ?? null));
    // Build the JSON Response directly: c.json's generic chokes on the
    // recursive JsonValue type. RPC returns the raw handler result.
    return new Response(JSON.stringify(result ?? null), {
        headers: { 'Content-Type': 'application/json' },
    });
});
