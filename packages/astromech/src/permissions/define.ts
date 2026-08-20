/**
 * Permission declarations — the authoring surface for grantable permission
 * keys. A flat record, one bare key per unit; core namespaces the key at
 * registration. Keys must be ONE LEVEL DEEP — a `:` is a crash-loud error.
 */

/** One grantable permission: what a matrix view shows for it. */
export type PermissionDeclaration = {
    label: string;
    description?: string;
};

/** A flat declaration keyed by bare permission key. */
export type PermissionDeclarations = Record<string, PermissionDeclaration>;

/**
 * Declare the permissions a plugin makes grantable. Keys stay literal, so
 * `plugin.permissions('read')` type-checks and a typo does not.
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
 * Core is the only legitimate caller — core *is* the root namespace, so
 * these are absolute, not bare keys awaiting one. Not exported from the package root.
 */
export function defineAbsolutePermissions<const D extends PermissionDeclarations>(
    declaration: D
): D {
    return declaration;
}
