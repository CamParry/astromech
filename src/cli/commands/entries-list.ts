import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { entries } from '@/sdk/local/entries.js';

export default defineCommand({
    meta: { name: 'entries:list', description: 'List entries for a given type' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        status: { type: 'string', description: 'Filter by status' },
        limit: { type: 'string', description: 'Max results', default: '20' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const results = await entries.all({
            type: args.type,
            ...(args.status ? { filters: { status: args.status } } : {}),
        });
        const limited = results.slice(0, parseInt(args.limit, 10));
        if (limited.length === 0) {
            console.log('No entries found.');
            return;
        }
        for (const e of limited) {
            console.log(`${e.id}  ${e.status}  ${e.title}`);
        }
    },
});
