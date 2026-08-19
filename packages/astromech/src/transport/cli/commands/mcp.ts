import type { ConfirmOptions } from '@/policies/confirmation';
import type { MethodFilter } from '@/policies/method-filter';
import { defineCommand } from 'citty';
import { confirmArgs, toConfirmOptions } from '../confirm-args';
import { filterArgs, toMethodFilter } from '../filter-args';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

type RunMcpServer = (
    configPath?: string,
    filter?: MethodFilter,
    confirm?: ConfirmOptions,
    options?: { allowRemote?: boolean }
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
        ...allowRemoteArgs,
    },
    async run({ args }) {
        let mod: { runMcpServer: RunMcpServer };
        try {
            // Dynamic import keeps @modelcontextprotocol/sdk out of the module
            // graph until the user actually runs `astromech mcp`.
            mod = (await import(
                /* @vite-ignore */
                '@/transport/mcp/index'
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
            toConfirmOptions(args.confirm),
            toAllowRemoteOption(args)
        );
    },
});
