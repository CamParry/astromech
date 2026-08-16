import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config';
import { forceArgs, toForceOption } from '../force-args';
import { generateClientTypes } from '@/codegen/type-generator';
import { collectPluginFieldTypes } from '@/plugins/runtime/plugin-fields';
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
        ...forceArgs,
    },
    async run({ args }) {
        const rawConfig = await loadRawConfig(args.config);
        const resolved = await loadConfig(args.config, toForceOption(args));
        const plugins = rawConfig.plugins ?? [];
        const types = generateClientTypes(
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
