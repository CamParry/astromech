import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { entries } from '@/sdk/local/entries.js';

export default defineCommand({
    meta: { name: 'entries:get', description: 'Get a single entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const entry = await entries.get(args.id, { type: args.type });
        if (!entry) {
            console.error('Entry not found');
            process.exit(1);
        }
        console.log(JSON.stringify(entry, null, 2));
    },
});
