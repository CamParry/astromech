import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { entries } from '@/entries/service.js';
import { printResult, printError } from '../output.js';

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
    },
    async run({ args }) {
        try {
            await loadConfig(args.config);
            const entry = await entries.unpublish({ type: args.type, id: args.id });
            printResult(entry, {
                json: args.json,
                text: () => console.log(`Unpublished ${args.type} ${args.id}`),
            });
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
