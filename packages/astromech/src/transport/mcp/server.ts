/**
 * MCP Server
 *
 * Wires a low-level MCP Server instance with ListTools + CallTool handlers
 * built from the method manifest.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { buildTools, type McpToolDef, type SkippedMethod } from './tools';
import type { ConfirmOptions } from '@/policies/confirmation';
import type { MethodManifest } from '@/types/index';

// ============================================================================
// Types
// ============================================================================

type CreateMcpServerResult = {
    server: Server;
    tools: McpToolDef[];
    skipped: SkippedMethod[];
};

/**
 * Serialize a dispatch result to MCP tool-result text. Coerces `undefined`
 * (void-returning methods like delete) to `"null"` — `JSON.stringify(undefined)`
 * is `undefined`, which the MCP CallToolResult schema rejects (text must be a
 * string).
 */
export function toToolResultText(result: unknown): string {
    return JSON.stringify(result ?? null, null, 2);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * @param confirm Confirmation policy, applied inside the dispatch map so a
 * gated call is turned back before the service is reached. Undefined is off.
 */
export function createMcpServer(
    manifest: MethodManifest,
    confirm?: ConfirmOptions | undefined
): CreateMcpServerResult {
    const { tools, dispatch, skipped } = buildTools(manifest, confirm);

    const server = new Server(
        { name: 'astromech', version: String(manifest.version) },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, () => {
        return {
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
                annotations: t.annotations,
            })),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        const invoke = dispatch.get(name);

        if (!invoke) {
            return {
                content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        try {
            const result = await invoke((args ?? {}) as Record<string, unknown>);
            return {
                content: [{ type: 'text' as const, text: toToolResultText(result) }],
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: 'text' as const, text: message }],
                isError: true,
            };
        }
    });

    return { server, tools, skipped };
}
