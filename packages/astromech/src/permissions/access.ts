/**
 * `AccessRule`, the rule a service method or a plugin's raw route declares for
 * its callers, and `resolveAccess`, what that rule means for one call. The one
 * place the five forms are read, so `permissionsFor`, the scoped handles, the
 * manifest and the plugin routes cannot each hold a copy.
 */

import type { Permission } from '@/permissions/permission';
import type { Role, User } from '@/types/domain';
import { resolvePluginPermission } from '@/plugins/runtime/plugin-identity';

/**
 * Who is making a call, as a function rule sees them: the signed-in user and
 * the role checked, each null when there is none. A context's `user` and `role`.
 */
export type Caller = { user: User | null; role: Role | null };

/** No user and no role: what a rule resolves against when a call has no caller. */
export const NO_CALLER: Caller = { user: null, role: null };

/**
 * What a function rule demands when a refusal should say why in its own words:
 * every one of `permissions`, and `message` as the whole refusal.
 */
export type AccessDemand = { permissions: readonly Permission[]; message: string };

/**
 * The function form of an access rule: the permissions this call needs, from
 * its input as the caller sent it and from the caller. `null` is none.
 */
export type AccessFunction<Input = unknown> = (
    input: Input,
    caller: Caller
) => Permission | readonly Permission[] | AccessDemand | null;

/**
 * What a method demands of its caller. `'authenticated'` holds when the caller
 * has a role, `Permission` is the bare core form, `{ permission }` is the plugin
 * form resolved under the plugin's namespace, and the function form answers per
 * call ({@link AccessFunction}). A raw route has no input, so its function form
 * is called with `undefined`.
 */
export type AccessRule<Input = unknown> =
    | 'public'
    | 'authenticated'
    | Permission
    | { permission: string }
    | AccessFunction<Input>;

/**
 * What `access` demands of this one call: every one of `permissions`, when it
 * names any. `message` is the refusal a function rule worded for itself.
 */
export type ResolvedAccess =
    | { kind: 'public' }
    | { kind: 'authenticated' }
    | { kind: 'permission'; permissions: readonly Permission[]; message?: string };

/**
 * Resolve `access` for one call: `input` as the caller sent it, and `caller`,
 * which a function rule reads to answer per caller (a user's own account). A
 * call with no caller, such as the permission catalogue's, resolves against
 * {@link NO_CALLER}. `namespace` is the plugin's permission namespace, which
 * only the object form needs: a core catalogue never uses that form, so
 * resolving one without a namespace throws. The parameter is
 * `AccessRule<never>`, the form every `AccessRule` widens to.
 */
export function resolveAccess(
    access: AccessRule<never>,
    input: unknown,
    caller: Caller = NO_CALLER,
    namespace?: string
): ResolvedAccess {
    if (access === 'public') return { kind: 'public' };
    if (access === 'authenticated') return { kind: 'authenticated' };

    if (typeof access === 'function') {
        const demanded = (access as AccessFunction)(input, caller);
        if (demanded === null) return { kind: 'public' };
        if (typeof demanded === 'string') {
            return { kind: 'permission', permissions: [demanded] };
        }
        if (isAccessDemand(demanded)) {
            return {
                kind: 'permission',
                permissions: demanded.permissions,
                message: demanded.message,
            };
        }
        return { kind: 'permission', permissions: demanded };
    }

    if (typeof access === 'string') return { kind: 'permission', permissions: [access] };

    if (namespace === undefined) {
        throw new Error(
            `Astromech cannot resolve the access \`{ permission: "${access.permission}" }\`: ` +
                `a bare permission key is resolved under a plugin's permission namespace, ` +
                `and none was given.`
        );
    }
    return {
        kind: 'permission',
        permissions: [resolvePluginPermission(namespace, access.permission)],
    };
}

/** Whether a function rule's answer is the worded form rather than a list. */
function isAccessDemand(
    demanded: readonly Permission[] | AccessDemand
): demanded is AccessDemand {
    return !Array.isArray(demanded);
}

/**
 * The first permission `access` demands that `allows` refuses, or null when it
 * demands none the caller lacks. What a refusal names as the missing grant.
 */
export function deniedPermission(
    access: Extract<ResolvedAccess, { kind: 'permission' }>,
    allows: (permission: Permission) => boolean
): Permission | null {
    return access.permissions.find((permission) => !allows(permission)) ?? null;
}
