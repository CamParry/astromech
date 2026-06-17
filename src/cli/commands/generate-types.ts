import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config.js';
import { generateSdkTypes } from '@/codegen/type-generator.js';
import { collectPluginFieldTypes } from '@/plugins/runtime/plugin-fields.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export default defineCommand({
    meta: {
        name: 'generate:types',
        description: 'Generate TypeScript types from config',
    },
    args: {
        out: {
            type: 'string',
            description: 'Output path',
            default: '.astro/astromech.d.ts',
        },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        const rawConfig = await loadRawConfig(args.config);
        const resolved = await loadConfig(args.config);
        const plugins = rawConfig.plugins ?? [];
        const types = generateSdkTypes(
            resolved,
            collectPluginFieldTypes(plugins),
            plugins
        );
        const outPath = resolve(process.cwd(), args.out);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, types, 'utf-8');
        console.log(`Types written to ${args.out}`);
    },
});
