/**
 * Permission declarations — the authoring surface for grantable permission keys.
 *
 * A declaration is a flat record: one bare key per grantable unit, with the
 * label a permissions matrix shows. Core namespaces the key at registration
 * (`plugin:<namespace>:<key>` for a plugin), so the author never writes a
 * prefix and never has to know one.
 *
 * Keys must be ONE LEVEL DEEP — a `:` anywhere in a key is a crash-loud error.
 * The reason is that two rules turn a declared key into a permission string and
 * they disagree the moment a key contains a colon: the enforcement side
 * (`resolvePluginPermission`, `plugins/runtime/plugin-identity.ts`) passes any
 * string containing `:` through *unchanged*, so core permissions stay
 * expressible, while the factory's grant accessor prefixes unconditionally.
 * Forbidding `:` in keys makes the two agree for every key that can exist. The
 * colon-bearing keys were exactly the ones that should never have been
 * hand-written anyway: entry permissions are derived from the registered entry
 * types (`permissions/entry-permission.ts`), not declared.
 */

/** One grantable permission: what a matrix view shows for it. */
export type PermissionDeclaration = {
    label: string;
    description?: string;
};

/** A flat declaration keyed by bare permission key. */
export type PermissionDeclarations = Record<string, PermissionDeclaration>;

/**
 * Declare the permissions a plugin makes grantable.
 *
 * ```ts
 * export const backupsPermissions = definePermissions({
 *     read: { label: 'View backups', description: 'List backup runs.' },
 *     restore: { label: 'Restore from backup' },
 * });
 * ```
 *
 * The keys stay literal, so `plugin.permissions('read')` type-checks and
 * `plugin.permissions('raed')` does not.
 */
export function definePermissions<const D extends PermissionDeclarations>(
    declaration: D
): D {
    for (const key of Object.keys(declaration)) {
        if (key.includes(':')) {
            throw new Error(
                `Invalid permission key "${key}": permission keys are one level deep and must not contain ":". ` +
                    `Core namespaces the key at registration (a plugin key becomes \`plugin:<namespace>:<key>\`), ` +
                    `and entry permissions are derived from the registered entry types rather than declared.`
            );
        }
    }
    return declaration;
}

/**
 * Declare permissions whose keys are ALREADY the full permission string.
 *
 * Core is the only legitimate caller: `media:upload` and friends are absolute —
 * they are not bare keys awaiting a namespace, because core *is* the root
 * namespace. Deliberately not exported from the package root, since a plugin
 * using it would be writing permission strings that its own grant accessor
 * cannot reproduce.
 */
export function defineAbsolutePermissions<const D extends PermissionDeclarations>(
    declaration: D
): D {
    return declaration;
}
