/**
 * Annotate a method manifest for one role — "which of these may I call?"
 * ADVISORY UX ONLY: not the security boundary — `scopeMethods`/`scopeEntries`
 * in `policies/scoped-services.ts` are, and hold regardless of this.
 */

import type { ManifestMethod, Permission, Role } from '@/types/index';
import { can } from '@/permissions/index';

export type AnnotatedManifestMethod = ManifestMethod & {
    /** true = the role holds it; false = denied; null = input-derived, decidable only at call time. */
    allowed: boolean | null;
};

/**
 * Whether one role may call one method — `null` where only a call can tell
 * (a dynamic permission resolves from the call input). A missing role holds
 * nothing, so every gated method is denied, the same rule `permissionsFor` applies.
 */
function allowedFor(
    method: ManifestMethod,
    role: Role | null | undefined
): boolean | null {
    if (method.permissionDynamic === true) return null;
    if (method.permission === null) return true; // ungated
    if (!role) return false;
    return can(role, method.permission as Permission);
}

/** Annotate every method with whether `role` may call it. */
export function annotateManifest(
    methods: ManifestMethod[],
    role: Role | null | undefined
): AnnotatedManifestMethod[] {
    return methods.map((method) => ({ ...method, allowed: allowedFor(method, role) }));
}
