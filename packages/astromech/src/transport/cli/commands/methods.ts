import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { printError } from '../output.js';

export default defineCommand({
    meta: { name: 'methods', description: 'List method-manifest entries' },
    args: {
        filter: {
            type: 'string',
            description: 'Case-insensitive substring match on method name',
        },
        source: {
            type: 'string',
            description: 'Filter by source: core | entries | plugin',
        },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        try {
            const rawConfig = await loadRawConfig(args.config);
            const resolved = await loadConfig(args.config);
            const plugins = rawConfig.plugins ?? [];
            const manifest = JSON.parse(generateMethodManifest(resolved, plugins)) as {
                version: number;
                methods: Record<string, unknown>[];
            };

            let methods = manifest.methods;

            if (args.source !== undefined) {
                methods = methods.filter((m) => m['source'] === args.source);
            }
            if (args.filter !== undefined) {
                const f = args.filter.toLowerCase();
                methods = methods.filter((m) =>
                    String(m['name']).toLowerCase().includes(f)
                );
            }

            if (args.json) {
                console.log(
                    JSON.stringify({ version: manifest.version, methods }, null, 2)
                );
                return;
            }

            for (const m of methods) {
                const name = String(m['name']);
                const effects: string[] = [];
                if (m['mutates'] === true) {
                    effects.push('mutates');
                }
                if (m['destructive'] === true) {
                    effects.push('destructive');
                }
                const effectStr = effects.length > 0 ? `[${effects.join(' ')}]` : '';

                const permission =
                    m['permission'] !== null
                        ? String(m['permission'])
                        : m['permissionDynamic'] === true
                          ? 'dynamic'
                          : 'none';

                const effectPart = effectStr ? `  ${effectStr}` : '';
                console.log(`${name}${effectPart}  (permission: ${permission})`);
            }
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
