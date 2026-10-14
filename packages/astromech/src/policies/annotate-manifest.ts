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
 * What a manifest entry records of a method's access, or null where only a
 * call can tell (a dynamic permission resolves from the call input).
 */
function manifestAccess(method: ManifestMethod): ResolvedAccess | null {
    if (method.permissionDynamic === true) return null;
    // A plugin's `authenticated` access carries no permission but still needs a role.
    if (method.source === 'plugin' && method.access === 'authenticated') {
        return { kind: 'authenticated' };
    }
    if (method.permission === null) return { kind: 'public' };
    return { kind: 'permission', permissions: [method.permission] };
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
