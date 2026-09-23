/**
 * Tool Dispatch
 *
 * One dispatcher for every manifest method, shared by the MCP server, the CLI,
 * the RPC route and the AI tool loop: a tool is a projection of manifest fields,
 * and its `invoke` is `callMethod`, so no transport can drift from the method.
 */

import type { MethodCaller } from '@/policies/call-method';
import type { AppContext, ManifestMethod, ToolDefinition } from '@/types/index';
import { confirmMessage } from '@/policies/confirmation';

// The dispatch shapes live in the pure leaf so `types/plugins.ts` can name them.
export type { ToolAnnotations, ToolDefinition } from '@/types/index';

/**
 * Either a dispatchable tool or the reason there isn't one. A bare `null` told
 * the caller nothing, so every omission looked the same as a bug.
 */
export type DispatchResult =
    | { ok: true; tool: ToolDefinition }
    | { ok: false; reason: string };

/**
 * The tool name for a method. MCP names must match `^[a-zA-Z0-9_-]{1,128}$`, so
 * every separator is an underscore; `buildTools` still sanitises, because a
 * plugin's service key is author-supplied.
 */
function toolNameFor(manifest: ManifestMethod): string {
    switch (manifest.source) {
        case 'core':
            return `${manifest.module}_${manifest.method}`;
        case 'plugin':
            return `plugins_${manifest.serviceKey}_${manifest.method}`;
        case 'entries':
            // The type id keeps a plugin type's namespace, so two plugins
            // declaring a `page` type do not collide.
            return `entries_${manifest.typeId.replaceAll('/', '_')}_${manifest.method}`;
    }
}

/**
 * Build a ToolDefinition from a ManifestMethod, or explain why the method is not
 * callable over JSON-RPC. `invoke` calls the raw services, unscoped, so this is
 * for a trusted caller with no role: the dev-only MCP server and the CLI.
 */
export function buildDispatch(manifest: ManifestMethod): DispatchResult {
    return projectTool(manifest, 'trusted');
}

/**
 * The same dispatch, with `invoke` calling through `scopedServices(ctx)` so
 * every call runs as `ctx` and is checked against what its role holds. A
 * missing role is allowed nothing, never treated as trusted; that is what
 * `buildDispatch` is for.
 */
export function buildScopedDispatch(
    manifest: ManifestMethod,
    ctx: AppContext
): DispatchResult {
    return projectTool(manifest, { ctx });
}

/** Project a manifest method into a tool whose `invoke` acts for `caller`. */
function projectTool(manifest: ManifestMethod, caller: MethodCaller): DispatchResult {
    // Declared uncallable by the method itself (a `File` input). Checked before
    // the schema, because such a method HAS a schema — one that degrades to `{}`
    // and would otherwise look perfectly callable.
    if (manifest.binaryInput === true) {
        return { ok: false, reason: 'binary input — not expressible over JSON-RPC' };
    }

    // A method declares its `input`, so a null here is a schema that would not
    // serialise. It cannot be honestly described to a client, so it is skipped
    // rather than given a hand-written stand-in that drifts.
    const inputSchema = manifest.input ?? null;
    if (inputSchema === null) {
        return { ok: false, reason: 'no input schema declared on the descriptor' };
    }

    // A trusted caller has no signed-in user for the method to act on, so the
    // tool is refused here rather than offered and refused by `callMethod`.
    if (caller === 'trusted' && manifest.sessionScoped === true) {
        return { ok: false, reason: 'session-scoped — this transport has no user' };
    }

    return {
        ok: true,
        tool: {
            name: toolNameFor(manifest),
            id: manifest.id,
            description: manifest.summary ?? manifest.name,
            inputSchema,
            annotations: {
                // The id, not the name: `entries.get` is the name of every entry
                // type's get, so a name would title nine tools identically.
                title: manifest.id,
                readOnlyHint: !manifest.mutates,
                destructiveHint: manifest.destructive,
                idempotentHint: manifest.idempotent,
            },
            permission: manifest.permission,
            permissionDynamic: manifest.permissionDynamic === true,
            confirmMessage: (args) => confirmMessage(manifest, args),
            // Imported at call time: `app-context.ts` reaches this file through
            // `scoped-tools.ts`, and `call-method.ts` imports the scoped handle
            // and every service, so a static import would close a cycle there.
            invoke: async (args) =>
                (await import('@/policies/call-method')).callMethod(
                    manifest,
                    args,
                    caller
                ),
        },
    };
}
