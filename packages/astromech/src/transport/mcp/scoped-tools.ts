/**
 * The tool surface one principal reaches: every manifest method that role may
 * call, each dispatched through `buildScopedDispatch`. Lives beside
 * `dispatch.ts` because it composes it, and serves the AI tool-loop as well as
 * MCP.
 */

import type { Role, ToolDispatch } from '@/types/index.js';
import { getMethodManifest } from '@/codegen/manifest-registry.js';
import { reduceSurface } from '@/policies/tool-surface.js';
import { annotateManifest } from '@/policies/annotate-manifest.js';
import { buildScopedDispatch } from '@/transport/mcp/dispatch.js';

/** Build the dispatches this principal reaches, narrowed by the surface options. */
export function buildScopedTools(
    principal: Role | undefined,
    options?: { readOnly?: boolean }
): ToolDispatch[] {
    const manifest = getMethodManifest();
    if (manifest === undefined) {
        throw new Error(
            'The method manifest is only populated at runtime boot, so a missing one is a wiring bug rather than an empty tool list.'
        );
    }

    // `buildScopedDispatch` refuses every plugin method — a plugin's declared
    // `access` is enforced by the HTTP RPC route, not by dispatch — so they are
    // dropped here rather than built into a list of refusals.
    const dispatchable = manifest.methods.filter((method) => method.source !== 'plugin');

    const surface = reduceSurface(dispatchable, { readOnly: options?.readOnly });

    // A size reduction, NOT a security measure: the annotation is advisory and
    // `buildScopedDispatch` is what actually refuses. `allowed === null` is an
    // input-derived permission only the scoped handle can decide, so it stays.
    const permitted = annotateManifest(surface.methods, principal).filter(
        (method) => method.allowed !== false
    );

    const tools: ToolDispatch[] = [];
    for (const method of permitted) {
        const dispatch = buildScopedDispatch(method, principal);
        if (!dispatch.ok) continue;
        tools.push(dispatch.tool);
    }
    return tools;
}
