/**
 * Annotate a method manifest for one role — "which of these may I call?"
 * ADVISORY UX ONLY: not the security boundary — `scopeMethods`
 * in `policies/scoped-services.ts` is, and holds regardless of this.
 */

import type { ResolvedAccess } from '@/permissions/access';
import type { ManifestMethod, Role } from '@/types/index';
import { permissionsFor } from '@/permissions/permissions-for';

export type AnnotatedManifestMethod = ManifestMethod & {
    /** true = the role holds it; false = denied; null = input-derived, decidable only at call time. */
    allowed: boolean | null;
};

/**
 * A manifest method's access as `allowsAccess` reads it, or null when only a
 * call can tell (a dynamic permission resolves from the call input).
 */
function manifestAccess(method: ManifestMethod): ResolvedAccess | null {
    if (method.dynamic) return null;
    if (method.access === 'permission') {
        return { kind: 'permission', permissions: method.permissions };
    }
    return { kind: method.access };
}

/** Annotate every method with whether `role` may call it. A missing role holds nothing. */
export function annotateManifest(
    methods: ManifestMethod[],
    role: Role | null | undefined
): AnnotatedManifestMethod[] {
    const permissions = permissionsFor(role);
    return methods.map((method) => {
        const access = manifestAccess(method);
        return {
            ...method,
            allowed: access === null ? null : permissions.allowsAccess(access),
        };
    });
}
