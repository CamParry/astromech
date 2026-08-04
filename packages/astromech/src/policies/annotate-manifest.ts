/**
 * Annotate a method manifest for one role — "which of these may I call?"
 *
 * ADVISORY UX ONLY. The annotation exists so a caller can be told up front that
 * it cannot publish, instead of discovering it by spending a turn on a call that
 * refuses; and so `astromech methods --role editor` can show a human what a role
 * actually reaches. It is NOT the security boundary — `scopeMethods`/
 * `scopeEntries` in `policies/scoped-service.ts` are, and they hold whether or
 * not anything read this. Never trust a model to respect the annotation: a model
 * that ignores it and calls anyway gets a `PermissionDeniedError` and nothing
 * happens (ai-integration decision 11).
 */

import type { ManifestMethod, Permission, Role } from '@/types/index.js';
import { can } from '@/permissions/index.js';

export type AnnotatedManifestMethod = ManifestMethod & {
    /** true = the role holds it; false = denied; null = input-derived, decidable only at call time. */
    allowed: boolean | null;
};

/**
 * Whether one role may call one method — `null` where only a call can tell.
 *
 * A dynamic permission is `null` rather than a guess: it resolves from the call
 * input (which entry type, in practice), and answering it here would mean
 * inventing an input. A missing role holds nothing, so every gated method is
 * denied — the same rule `permissionsFor` applies.
 */
function allowedFor(method: ManifestMethod, role: Role | undefined): boolean | null {
    if (method.permissionDynamic === true) return null;
    if (method.permission === null) return true; // ungated
    if (!role) return false;
    return can(role, method.permission as Permission);
}

/** Annotate every method with whether `role` may call it. */
export function annotateManifest(
    methods: ManifestMethod[],
    role: Role | undefined
): AnnotatedManifestMethod[] {
    return methods.map((method) => ({ ...method, allowed: allowedFor(method, role) }));
}
