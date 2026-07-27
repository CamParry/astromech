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
import { buildTools, type McpToolDef } from './tools.js';

// ============================================================================
// Types
// ============================================================================

type ParsedManifest = {
    version: number;
    methods: {
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
    }[];
};

type CreateMcpServerResult = {
    server: Server;
    tools: McpToolDef[];
    skipped: string[];
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

export function createMcpServer(manifest: ParsedManifest): CreateMcpServerResult {
    const { tools, dispatch, skipped } = buildTools(manifest);

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
