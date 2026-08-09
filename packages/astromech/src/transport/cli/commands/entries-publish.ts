import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { entriesService } from '@/entries/service';
import { printResult, printError } from '../output';

export default defineCommand({
    meta: { name: 'entries:publish', description: 'Publish an entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        try {
            await loadConfig(args.config);
            const entry = await entriesService.publish({ type: args.type, id: args.id });
            printResult(entry, {
                json: args.json,
                text: () => console.log(`Published ${args.type} ${args.id}`),
            });
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
