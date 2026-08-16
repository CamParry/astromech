import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';
import {
    generateMethodManifest,
    METHOD_MANIFEST_FILENAME,
} from '@/codegen/method-manifest';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export default defineCommand({
    meta: {
        name: 'generate:manifest',
        description: 'Generate a JSON method manifest from config',
    },
    args: {
        out: {
            type: 'string',
            description: 'Output path',
            default: `.astro/${METHOD_MANIFEST_FILENAME}`,
        },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        const rawConfig = await loadRawConfig(args.config);
        const resolved = await loadConfig(args.config, toAllowRemoteOption(args));
        const plugins = rawConfig.plugins ?? [];
        const json = generateMethodManifest(resolved, plugins);
        const outPath = resolve(process.cwd(), args.out);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, json, 'utf-8');
        console.log(`Manifest written to ${args.out}`);
    },
});
