/**
 * MCP Tool List Builder
 *
 * Pure function — takes the parsed method manifest and returns the MCP tool
 * list plus a dispatch map keyed by tool name. No I/O; unit-testable.
 */

import { buildDispatch, type ToolDispatch, type ToolAnnotations } from './dispatch.js';

// ============================================================================
// Types
// ============================================================================

/** Shape of one tool as returned to the MCP client's ListTools response. */
export type McpToolDef = {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: ToolAnnotations;
};

/** Parsed method manifest — minimal slice this module cares about. */
type ManifestMethod = {
    name: string;
    summary?: string | undefined;
    source: 'core' | 'entries' | 'plugin';
    mutates: boolean;
    destructive: boolean;
    idempotent: boolean;
    input?: unknown;
    entryType?: string;
    mount?: string;
    plugin?: string;
};

type ParsedManifest = {
    version: number;
    methods: ManifestMethod[];
};

type BuildToolsResult = {
    tools: McpToolDef[];
    dispatch: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
    skipped: string[];
};

// ============================================================================
// Builder
// ============================================================================

/**
 * Build the MCP tool list and dispatch map from the method manifest.
 *
 * Duplicate tool names are deduplicated by keeping the first occurrence; the
 * second occurrence is added to `skipped` with a note.
 */
export function buildTools(manifest: ParsedManifest): BuildToolsResult {
    const tools: McpToolDef[] = [];
    const dispatch = new Map<
        string,
        (args: Record<string, unknown>) => Promise<unknown>
    >();
    const skipped: string[] = [];
    const seenToolNames = new Set<string>();

    for (const method of manifest.methods) {
        let toolDispatch: ToolDispatch | null;
        try {
            toolDispatch = buildDispatch(method);
        } catch {
            skipped.push(method.name);
            continue;
        }

        if (toolDispatch === null) {
            skipped.push(method.name);
            continue;
        }

        const { toolName, description, inputSchema, annotations, invoke } = toolDispatch;

        // Sanitize: replace dots with underscores (names must match ^[a-zA-Z0-9_-]{1,128}$)
        const safeName = toolName.replace(/\./g, '_');

        if (seenToolNames.has(safeName)) {
            skipped.push(`${method.name} (duplicate tool name: ${safeName})`);
            continue;
        }

        seenToolNames.add(safeName);
        tools.push({ name: safeName, description, inputSchema, annotations });
        dispatch.set(safeName, invoke);
    }

    return { tools, dispatch, skipped };
}
