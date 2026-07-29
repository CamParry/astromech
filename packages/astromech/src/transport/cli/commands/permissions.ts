import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config.js';
import { buildPermissionCatalogue } from '@/permissions/catalogue.js';
import { printError } from '../output.js';

export default defineCommand({
    meta: { name: 'permissions', description: 'List grantable permissions' },
    args: {
        filter: {
            type: 'string',
            description: 'Case-insensitive substring match on the permission string',
        },
        source: {
            type: 'string',
            description: 'Filter by source: core | entry | plugin',
        },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        try {
            const rawConfig = await loadRawConfig(args.config);
            const resolved = await loadConfig(args.config);
            const plugins = rawConfig.plugins ?? [];

            let permissions = buildPermissionCatalogue(resolved, plugins);

            if (args.source !== undefined) {
                permissions = permissions.filter((p) => p.source === args.source);
            }
            if (args.filter !== undefined) {
                const f = args.filter.toLowerCase();
                permissions = permissions.filter((p) =>
                    p.permission.toLowerCase().includes(f)
                );
            }

            if (args.json) {
                console.log(JSON.stringify(permissions, null, 2));
                return;
            }

            // Pad the permission column so labels line up down the list.
            const width = permissions.reduce(
                (max, p) => Math.max(max, p.permission.length),
                0
            );

            for (const p of permissions) {
                const owner = p.owner !== undefined ? `  (${p.owner})` : '';
                console.log(`${p.permission.padEnd(width)}  ${p.label}${owner}`);
            }
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
