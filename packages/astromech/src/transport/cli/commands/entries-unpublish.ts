import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';
import { entriesService } from '@/entries/service';
import { printResult, printError } from '../output';

export default defineCommand({
    meta: {
        name: 'entries:unpublish',
        description: 'Unpublish an entry (revert to draft)',
    },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        try {
            await loadConfig(args.config, toAllowRemoteOption(args));
            const entry = await entriesService.unpublish({
                type: args.type,
                id: args.id,
            });
            printResult(entry, {
                json: args.json,
                text: () => console.log(`Unpublished ${args.type} ${args.id}`),
            });
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
