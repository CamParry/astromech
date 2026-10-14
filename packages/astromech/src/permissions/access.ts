/**
 * `AccessRule`, the rule a service method or a plugin's raw route declares for
 * its callers, and `resolveAccess`, what that rule means for one call. The one
 * place the five forms are read, so `permissionsFor`, the scoped handles, the
 * manifest and the plugin routes cannot each hold a copy.
 */

import type { Permission } from '@/permissions/permission';
import { resolvePluginPermission } from '@/plugins/runtime/plugin-identity';

/**
 * What a method demands of its caller. `'authenticated'` holds when the caller
 * has a role, `Permission` is the bare core form, `{ permission }` is the plugin
 * form resolved under the plugin's namespace, and the function form answers per
 * input: `null` for none, or a list the caller must hold every one of. A raw
 * route has no input, so its function form is called with `undefined`.
 */
export type AccessRule<Input = unknown> =
    | 'public'
    | 'authenticated'
    | Permission
    | { permission: string }
    | ((input: Input) => Permission | readonly Permission[] | null);

/** What `access` demands of this one call: every one of `permissions`, when it names any. */
export type ResolvedAccess =
    | { kind: 'public' }
    | { kind: 'authenticated' }
    | { kind: 'permission'; permissions: readonly Permission[] };

/**
 * Resolve `access` against `input`. `namespace` is the plugin's permission
 * namespace, which only the object form needs — a core catalogue never uses
 * that form, so resolving one without a namespace throws. The parameter is
 * `AccessRule<never>`, the form every `AccessRule` widens to.
 */
export function resolveAccess(
    access: AccessRule<never>,
    input: unknown,
    namespace?: string
): ResolvedAccess {
    if (access === 'public') return { kind: 'public' };
    if (access === 'authenticated') return { kind: 'authenticated' };

    if (typeof access === 'function') {
        const demanded = (
            access as (input: unknown) => Permission | readonly Permission[] | null
        )(input);
        if (demanded === null) return { kind: 'public' };
        return {
            kind: 'permission',
            permissions: typeof demanded === 'string' ? [demanded] : demanded,
        };
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
