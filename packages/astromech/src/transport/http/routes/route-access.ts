/**
 * The check a REST route makes before it reads the request body: the caller's
 * permission for the method, then whether the target the path names exists.
 *
 * The scoped handle still enforces the permission; this decides the order. An
 * unknown entry type or global answers 403 to a role without the grant and 404
 * to one with it, so a caller cannot enumerate what it has no grant for.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ServiceMethodAccess } from '@/types/index';
import type { Context } from 'hono';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types';
import { resolveGlobal } from '@/globals/resolve-global';
import { resolveAccess } from '@/permissions/access';
import { permissionsFor } from '@/permissions/permissions-for';
import { forbidden, notFound } from '@/transport/http/middleware/errors';

type Env = { Variables: AuthVariables };

/** The 404 message for a target the arguments name but that does not exist, or null. */
export type MissingTarget = (args: Record<string, unknown>) => string | null;

/**
 * 403 when the caller's role may not make this call, 404 when `missingTarget`
 * finds nothing, null to go on. `args` are what the URL carries, since the body
 * is not read yet.
 */
export function routeAccess(
    c: Context<Env>,
    access: ServiceMethodAccess<never>,
    args: Record<string, unknown>,
    missingTarget?: MissingTarget
): Response | null {
    const resolved = resolveAccess(access, args);
    if (!permissionsFor(c.var.ctx.role).allowsAccess(resolved)) return forbidden(c);
    const missing = missingTarget?.(args);
    return missing ? notFound(c, missing) : null;
}

/** The entry type a call's `type` names, when the config does not declare it. */
export const missingEntryType: MissingTarget = (args) => {
    const type = String(args['type'] ?? '');
    return resolveEntryType(getConfig(), type) ? null : `Entry type '${type}' not found`;
};

/** The global a call's `key` names, when the config does not declare it. */
export const missingGlobal: MissingTarget = (args) => {
    const key = String(args['key'] ?? '');
    return resolveGlobal(getConfig(), key) ? null : `Global '${key}' not found`;
};
