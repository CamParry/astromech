import { defineCommand } from 'citty';

export default defineCommand({
    meta: { name: 'mcp', description: 'Start the MCP server over stdio' },
    args: {
        config: {
            type: 'string',
            description: 'Path to astromech.config.ts',
        },
    },
    async run({ args }) {
        let mod: { runMcpServer: (configPath?: string) => Promise<void> };
        try {
            // Dynamic import keeps @modelcontextprotocol/sdk out of the module
            // graph until the user actually runs `astromech mcp`.
            mod = (await import(
                /* @vite-ignore */
                '@/transport/mcp/index.js'
            )) as { runMcpServer: (configPath?: string) => Promise<void> };
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
        await mod.runMcpServer(args.config);
    },
});
