import { defineCommand } from 'citty';
import { filterArgs, toMethodFilter } from '../filter-args.js';
import { confirmArgs, toConfirmOptions } from '../confirm-args.js';
import type { MethodFilter } from '@/policies/method-filter.js';
import type { ConfirmOptions } from '@/policies/confirmation.js';

type RunMcpServer = (
    configPath?: string,
    filter?: MethodFilter,
    confirm?: ConfirmOptions
) => Promise<void>;

export default defineCommand({
    meta: { name: 'mcp', description: 'Start the MCP server over stdio' },
    args: {
        config: {
            type: 'string',
            description: 'Path to astromech.config.ts',
        },
        ...filterArgs,
        ...confirmArgs,
    },
    async run({ args }) {
        let mod: { runMcpServer: RunMcpServer };
        try {
            // Dynamic import keeps @modelcontextprotocol/sdk out of the module
            // graph until the user actually runs `astromech mcp`.
            mod = (await import(
                /* @vite-ignore */
                '@/transport/mcp/index.js'
            )) as { runMcpServer: RunMcpServer };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (
                message.includes('@modelcontextprotocol/sdk') ||
                message.includes('Cannot find package') ||
                message.includes('ERR_MODULE_NOT_FOUND')
            ) {
                process.stderr.write(
                    'Install @modelcontextprotocol/sdk to use the MCP server.\n'
                );
                process.exit(1);
            }
            throw err;
        }
        await mod.runMcpServer(
            args.config,
            toMethodFilter(args),
            toConfirmOptions(args.confirm)
        );
    },
});
