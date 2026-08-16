import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { forceArgs, toForceOption } from '../force-args';
import { entriesService } from '@/entries/service';

export default defineCommand({
    meta: { name: 'entries:get', description: 'Get a single entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...forceArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toForceOption(args));
        const entry = await entriesService.get({ type: args.type, id: args.id });
        if (!entry) {
            console.error('Entry not found');
            process.exit(1);
        }
        console.log(JSON.stringify(entry, null, 2));
    },
});
