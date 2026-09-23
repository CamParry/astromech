/**
 * The tool surface one context's role reaches: every manifest method it may call, each
 * dispatched through `buildScopedDispatch`. Lives beside `dispatch.ts` because
 * it composes it, and serves the AI tool-loop as well as MCP.
 */
import type { DispatchResult } from '@/transport/tools/dispatch';
import type { AppContext, ManifestMethod, ToolDefinition } from '@/types/index';
import { getMethodManifest } from '@/codegen/manifest-registry';
import { annotateManifest } from '@/policies/annotate-manifest';
import { filterMethods } from '@/policies/method-filter';
import { buildScopedDispatch } from '@/transport/tools/dispatch';

/** Build the tool definitions `ctx`'s role reaches, narrowed by the method filter. */
export function buildScopedTools(
    ctx: AppContext,
    options?: { readOnly?: boolean }
): ToolDefinition[] {
    const manifest = getMethodManifest();
    if (manifest === undefined) {
        throw new Error(
            'The method manifest is only populated at runtime boot, so a missing one is a wiring bug rather than an empty tool list.'
        );
    }

    const filtered = filterMethods(manifest.methods, { readOnly: options?.readOnly });

    // A size reduction, NOT a security measure: the annotation is advisory and
    // `buildScopedDispatch` is what actually refuses. `allowed === null` is an
    // input-derived permission only the scoped handle can decide, so it stays.
    const permitted = annotateManifest(filtered.methods, ctx.role).filter(
        (method) => method.allowed !== false
    );

    const tools: ToolDefinition[] = [];
    for (const method of permitted) {
        const dispatch = buildScopedDispatch(method, ctx);
        if (!dispatch.ok) continue;
        tools.push(dispatch.tool);
    }
    return tools;
}

/**
 * The dispatch one role gets for a single manifest method id, or undefined when
 * the manifest declares no such method. The method travels with the dispatch: a
 * transport mapping a request onto the call reads facts (`typeId`) the tool does
 * not carry.
 */
export function resolveScopedMethod(
    id: string,
    ctx: AppContext
): { method: ManifestMethod; dispatch: DispatchResult } | undefined {
    const method = getMethodManifest()?.methods.find((entry) => entry.id === id);
    if (method === undefined) return undefined;
    return { method, dispatch: buildScopedDispatch(method, ctx) };
}
