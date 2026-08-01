/**
 * MCP Server Entry
 *
 * Loads config, boots enough of the runtime for a tool call to actually land,
 * generates the method manifest, builds the tool list, then connects the server
 * over stdio. All logging goes to stderr — stdout is the JSON-RPC channel.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, loadRawConfig } from '@/transport/cli/config.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime.js';
import { wireEntryAccess } from '@/entries/plugin-access.js';
import { createMcpServer } from './server.js';
import type { AstromechConfig, MethodManifest, ResolvedConfig } from '@/types/index.js';

/**
 * Make plugin service methods reachable.
 *
 * `loadConfig` sets up the database and the virtual-config shim but never
 * touches the plugin runtime, so until now the plugin registry was empty and
 * any plugin tool would have thrown at call time. Three things are needed, in
 * this order — the same order `kernel/boot.ts` uses:
 *
 * - Importing the local transport registers the client that backs `ctx.entries`,
 *   `ctx.media` and friends. It is a module side effect, hence the bare import.
 * - `wireEntryAccess` plugs the entries domain into the port the plugin runtime
 *   mounts entry types through. `registerPlugins` throws without it.
 * - `registerPlugins` indexes the service methods AND registers each plugin
 *   table's codec, without which a plugin method querying its own table decodes
 *   its rows wrong.
 *
 * `bootPlugins` is deliberately NOT called: it runs `setup()` and registers cron
 * jobs, which is boot work a short-lived stdio process has no business doing.
 */
async function registerPluginRuntime(
    raw: AstromechConfig,
    resolved: ResolvedConfig
): Promise<void> {
    await import('@/transport/local/index.js');
    wireEntryAccess();
    registerPlugins(raw.plugins ?? [], resolved);
}

export async function runMcpServer(configPath?: string): Promise<void> {
    const raw = await loadRawConfig(configPath);
    const resolved = await loadConfig(configPath);
    await registerPluginRuntime(raw, resolved);

    const manifest = JSON.parse(
        generateMethodManifest(resolved, raw.plugins ?? [])
    ) as MethodManifest;

    const { server, tools, skipped } = createMcpServer(manifest);

    console.error(
        `[astromech mcp] ready: ${tools.length} tools, ${skipped.length} skipped`
    );

    // One line per skip, with its reason: a deliberate omission (a `File` input)
    // and a missing descriptor look identical in a bare list of ids, and the
    // point of the generic dispatcher is that the difference is now knowable.
    for (const { id, reason } of skipped) {
        console.error(`[astromech mcp] skipped ${id}: ${reason}`);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
