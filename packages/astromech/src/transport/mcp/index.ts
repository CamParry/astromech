/**
 * MCP Server Entry
 *
 * Loads config, creates the application so a tool call actually lands,
 * generates the method manifest, builds the tool list, then connects the server
 * over stdio. All logging goes to stderr — stdout is the JSON-RPC channel.
 */

import type { ConfirmOptions } from '@/policies/confirmation';
import type { MethodFilter } from '@/policies/method-filter';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAstromech } from '@/astromech';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { filterMethods } from '@/policies/method-filter';
import { loadConfig, loadRawConfig } from '@/transport/cli/config';
import { createMcpServer } from './server';

/** Above this many exclusions, the per-method lines stop being readable. */
const EXCLUSION_DETAIL_LIMIT = 20;

/**
 * Report what the method filter removed, on stderr.
 *
 * A long exclusion list is the NORMAL case for `--read-only` (most of a CMS's
 * manifest mutates), so past a threshold the per-method lines are replaced by a
 * count per reason. Losing which ids went is acceptable; `astromech methods
 * --json` answers that precisely, and the reason breakdown is what a human
 * scanning startup output actually needs.
 */
function reportExclusions(excluded: readonly { id: string; reason: string }[]): void {
    if (excluded.length <= EXCLUSION_DETAIL_LIMIT) {
        for (const { id, reason } of excluded) {
            console.error(`[astromech mcp] excluded ${id}: ${reason}`);
        }
        return;
    }

    const counts = new Map<string, number>();
    for (const { reason } of excluded) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    for (const [reason, count] of counts) {
        console.error(`[astromech mcp] excluded ${count} methods: ${reason}`);
    }
}

/**
 * The confirmation mode, for the ready line. Visible even when off, because a
 * caller that expected a gate and got none should be able to see that from the
 * one line the server prints rather than by watching a write land.
 */
function describeConfirm(confirm: ConfirmOptions | undefined): string {
    if (confirm === undefined) return 'off';
    const trigger = confirm.trigger ?? 'mutating';
    return typeof trigger === 'function' ? 'custom' : trigger;
}

/**
 * @param filter Method filter applied BEFORE the tool list is built, so an
 * excluded method never becomes a tool and never enters the dispatch map.
 * Filtering the tool list alone would leave the method callable by name.
 * @param confirm Confirmation policy, OFF unless `--confirm` was passed. An MCP
 * client already asks its user before running a tool, so a gate here would be a
 * second prompt answered by the same person — see `cli/confirm-args.ts`.
 */
export async function runMcpServer(
    configPath?: string,
    filter: MethodFilter = {},
    confirm?: ConfirmOptions,
    options?: { allowRemote?: boolean }
): Promise<void> {
    const raw = await loadRawConfig(configPath);
    // Guards the database and fills the config shim the local transport reads.
    const resolved = await loadConfig(configPath, options);
    await createAstromech({ config: raw });

    const manifest = generateMethodManifest(resolved, raw.plugins ?? []);

    const { methods, excluded } = filterMethods(manifest.methods, filter);
    const { server, tools, skipped } = createMcpServer({ ...manifest, methods }, confirm);

    console.error(
        `[astromech mcp] ready: ${tools.length} tools, ${skipped.length} skipped, ` +
            `${excluded.length} excluded by surface, ` +
            `confirm: ${describeConfirm(confirm)}`
    );
    console.error(
        `[astromech mcp] database: ${raw.db.type} ` +
            `(${raw.db.isRemote?.() === true ? 'remote' : 'local'})`
    );

    // Skipped and excluded stay distinct: a skip is a method that could not be
    // projected (binary input, no schema), an exclusion is a deliberate policy
    // choice. Collapsing them would make a misconfigured `--include` look like a
    // codegen gap.
    for (const { id, reason } of skipped) {
        console.error(`[astromech mcp] skipped ${id}: ${reason}`);
    }
    reportExclusions(excluded);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
