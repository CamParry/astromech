import { defineCommand } from 'citty';
import { generateClientTypes } from '@/codegen/type-generator';
import { configPathArgs } from '../common-args';
import { loadConfigWithoutDrivers } from '../config';
import { writeGenerated } from '../output';

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
        ...configPathArgs,
    },
    async run({ args }) {
        const { config: rawConfig, resolved } = await loadConfigWithoutDrivers(
            args.config
        );
        const plugins = rawConfig.plugins ?? [];
        const types = generateClientTypes(resolved, plugins);
        await writeGenerated(args.out, types);
        console.log(`Types written to ${args.out}`);
    },
});
