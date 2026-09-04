/**
 * `resolveAccess` — what a method's declared `access` means for one call. The
 * one place the five forms are read, so the permission guard, the scoped
 * handles, the manifest and the plugin RPC route cannot each hold a copy.
 */

import type { Permission, ServiceMethodAccess } from '@/types/index';
import { resolvePluginPermission } from '@/plugins/runtime/plugin-identity';

/** What `access` demands of this one call. */
export type ResolvedAccess =
    | { kind: 'public' }
    | { kind: 'authenticated' }
    | { kind: 'permission'; permission: Permission };

/**
 * Resolve `access` against `input`. `namespace` is the plugin's permission
 * namespace, which only the object form needs — a core catalogue never uses
 * that form, so resolving one without a namespace throws. The parameter is
 * `ServiceMethodAccess<never>`, the form every `ServiceMethodAccess` widens to.
 */
export function resolveAccess(
    access: ServiceMethodAccess<never>,
    input: unknown,
    namespace?: string
): ResolvedAccess {
    if (access === 'public') return { kind: 'public' };
    if (access === 'authenticated') return { kind: 'authenticated' };

    if (typeof access === 'function') {
        const permission = (access as (input: unknown) => Permission | null)(input);
        return permission === null
            ? { kind: 'public' }
            : { kind: 'permission', permission };
    }

    if (typeof access === 'string') return { kind: 'permission', permission: access };

    if (namespace === undefined) {
        throw new Error(
            `Astromech cannot resolve the access \`{ permission: "${access.permission}" }\`: ` +
                `a bare permission key is resolved under a plugin's permission namespace, ` +
                `and none was given.`
        );
    }
    return {
        kind: 'permission',
        permission: resolvePluginPermission(namespace, access.permission) as Permission,
    };
}
