import { defineCommand } from 'citty';
import {
    generateMethodManifest,
    METHOD_MANIFEST_FILENAME,
    serialiseMethodManifest,
} from '@/codegen/method-manifest';
import { configArgs, toAllowRemoteOption } from '../common-args';
import { loadConfig } from '../config';
import { writeGenerated } from '../output';

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
        ...configArgs,
    },
    async run({ args }) {
        const { config: rawConfig, resolved } = await loadConfig(
            args.config,
            toAllowRemoteOption(args)
        );
        const plugins = rawConfig.plugins ?? [];
        const json = serialiseMethodManifest(generateMethodManifest(resolved, plugins));
        await writeGenerated(args.out, json);
        console.log(`Manifest written to ${args.out}`);
    },
});
