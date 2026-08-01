/**
 * MCP Tool List Builder
 *
 * Pure function — takes the parsed method manifest and returns the MCP tool
 * list plus a dispatch map keyed by tool name. No I/O; unit-testable.
 */

import type { JsonSchemaObject, MethodManifest } from '@/types/index.js';
import { buildDispatch, type DispatchResult, type ToolAnnotations } from './dispatch.js';

// ============================================================================
// Types
// ============================================================================

/** Shape of one tool as returned to the MCP client's ListTools response. */
export type McpToolDef = {
    name: string;
    description: string;
    inputSchema: JsonSchemaObject;
    annotations: ToolAnnotations;
};

/**
 * A manifest method that produced no tool, and why. The reason is the point:
 * with one generic dispatcher, every remaining skip is either a method that
 * declared itself uncallable or a real gap, and a bare list of ids cannot tell
 * the two apart.
 */
export type SkippedMethod = { id: string; reason: string };

type BuildToolsResult = {
    tools: McpToolDef[];
    dispatch: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
    skipped: SkippedMethod[];
};

// ============================================================================
// Builder
// ============================================================================

/**
 * Build the MCP tool list and dispatch map from the method manifest.
 *
 * Duplicate tool names are deduplicated by keeping the first occurrence; the
 * second is recorded as skipped. `skipped` reports method IDs, not names —
 * `entries.create` alone names every entry type's create.
 */
export function buildTools(manifest: MethodManifest): BuildToolsResult {
    const tools: McpToolDef[] = [];
    const dispatch = new Map<
        string,
        (args: Record<string, unknown>) => Promise<unknown>
    >();
    const skipped: SkippedMethod[] = [];
    const seenToolNames = new Set<string>();

    for (const method of manifest.methods) {
        let result: DispatchResult;
        try {
            result = buildDispatch(method);
        } catch (err) {
            skipped.push({
                id: method.id,
                reason: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        if (!result.ok) {
            skipped.push({ id: method.id, reason: result.reason });
            continue;
        }

        const { toolName, description, inputSchema, annotations, invoke } = result.tool;

        // Sanitize: names must match ^[a-zA-Z0-9_-]{1,128}$. A plugin's service
        // key is author-supplied, so this is not merely belt-and-braces.
        const safeName = toolName.replace(/[^a-zA-Z0-9_-]/g, '_');

        if (seenToolNames.has(safeName)) {
            skipped.push({ id: method.id, reason: `duplicate tool name: ${safeName}` });
            continue;
        }

        seenToolNames.add(safeName);
        tools.push({ name: safeName, description, inputSchema, annotations });
        dispatch.set(safeName, invoke);
    }

    return { tools, dispatch, skipped };
}
