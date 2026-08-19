import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { generateClientTypes } from '@/codegen/type-generator';
import { collectPluginFieldTypes } from '@/plugins/runtime/plugin-fields';
import { loadConfig, loadRawConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

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
        ...allowRemoteArgs,
    },
    async run({ args }) {
        const rawConfig = await loadRawConfig(args.config);
        const resolved = await loadConfig(args.config, toAllowRemoteOption(args));
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
