/**
 * MCP Server Entry
 *
 * Loads config, generates the method manifest, builds the tool list, then
 * connects the server over stdio. All logging goes to stderr — stdout is the
 * JSON-RPC channel.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, loadRawConfig } from '@/transport/cli/config.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { createMcpServer } from './server.js';

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

export async function runMcpServer(configPath?: string): Promise<void> {
    const raw = await loadRawConfig(configPath);
    const resolved = await loadConfig(configPath);

    const manifest = JSON.parse(
        generateMethodManifest(resolved, raw.plugins ?? [])
    ) as ParsedManifest;

    const { server, tools, skipped } = createMcpServer(manifest);

    console.error(
        `[astromech mcp] ready: ${tools.length} tools, ${skipped.length} skipped`
    );

    if (skipped.length > 0) {
        console.error(`[astromech mcp] skipped: ${skipped.join(', ')}`);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
