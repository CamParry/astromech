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
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import { optionalAuth, requireAuth } from '@/transport/http/middleware/auth.js';
import { forbidden, notFound, unauthorized } from '@/transport/http/middleware/errors.js';
import {
    createPluginContext,
    getPluginEntryMounts,
    getPluginIdentity,
    getPluginRawRoutes,
    getPluginSdkMethods,
} from '@/plugins/runtime/plugin-runtime.js';
import { withPermissions } from '@/policies/permissions/with-permissions.js';
import { resolvePluginPermission } from '@/plugins/runtime/plugin-identity.js';
import { qualifyEntryType } from '@/entries/type-registry.js';
import { createEntriesRouter } from '@/transport/http/routes/entries.js';
import type { Context } from 'hono';
import type { Permission, PluginAccess, PluginContext } from '@/types/index.js';

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

    const permissions = withPermissions(c.var.role);
    const namespace = getPluginIdentity(name)?.permissionNamespace ?? name;
    const permission = resolvePluginPermission(
        namespace,
        access.permission
    ) as Permission;
    if (!permissions.allows(permission)) return forbidden(c);
    return null;
}

// ── Per-plugin entries mounts (registered before the RPC catch-all so the
//    static `/{name}/entries` segments win over `/:name/:method`) ────────────
//
// Each mount is its own entries router, namespaced to the plugin: bare wire
// types resolve against `pluginEntries[name]`, the entries service sees the
// qualified id, and permissions root at `plugin:{ns}:entry:{type}:{action}`.
// The plugins router runs `optionalAuth` (public RPC), so the entries subtree
// gets an explicit `requireAuth` — these routes are never public.
for (const { identity, entryTypes } of getPluginEntryMounts()) {
    pluginsRouter.use(`/${identity.name}/entries/*`, requireAuth);
    // The entries router needs full `AuthVariables` (requireAuth guarantees them
    // upstream); `.route` onto the partial-typed plugins router needs the cast.
    pluginsRouter.route(
        `/${identity.name}/entries`,
        createEntriesRouter({
            lookup: (t) => entryTypes[t],
            qualify: (t) => qualifyEntryType(identity.name, t),
            permissionFor: (t, a) =>
                `plugin:${identity.permissionNamespace}:entry:${t}:${a}`,
        }) as unknown as Hono<PluginEnv>
    );
}

// ── Raw escape-hatch routes (registered before the RPC catch-all) ──────────
for (const { identity, route } of getPluginRawRoutes()) {
    const method = (route.method ?? 'GET').toUpperCase();
    const path = `/${identity.name}${route.path}`;
    pluginsRouter.on(method, path, (c) => {
        const denied = enforceAccess(c, route.access, identity.name);
        if (denied) return denied;
        return route.handler(
            c.req.raw,
            createPluginContext(identity, c.var.user ?? null)
        );
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
    const result = await (sdkMethod.handler as (i: unknown, c: PluginContext) => unknown)(
        input,
        createPluginContext(identity, c.var.user ?? null)
    );
    // Build the JSON Response directly: c.json's generic chokes on the
    // recursive JsonValue type. RPC returns the raw handler result.
    return new Response(JSON.stringify(result ?? null), {
        headers: { 'Content-Type': 'application/json' },
    });
});
