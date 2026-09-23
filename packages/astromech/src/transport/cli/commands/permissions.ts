import { defineCommand } from 'citty';
import { buildPermissionCatalogue } from '@/permissions/catalogue';
import { configArgs, jsonArgs, toAllowRemoteOption } from '../common-args';
import { loadConfig } from '../config';
import { printError } from '../output';

export default defineCommand({
    meta: { name: 'permissions', description: 'List grantable permissions' },
    args: {
        filter: {
            type: 'string',
            description: 'Case-insensitive substring match on the permission string',
        },
        source: {
            type: 'string',
            description: 'Filter by source: core | entry | global | plugin',
        },
        ...jsonArgs,
        ...configArgs,
    },
    async run({ args }) {
        try {
            const { config: rawConfig, resolved } = await loadConfig(
                args.config,
                toAllowRemoteOption(args)
            );
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
