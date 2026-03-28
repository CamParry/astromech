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
        const limitNum = parseInt(args.limit, 10);
        const { data } = await entries.query({
            type: args.type,
            limit: limitNum,
            ...(args.status ? { where: { status: args.status } } : {}),
        });
        if (data.length === 0) {
            console.log('No entries found.');
            return;
        }
        for (const e of data) {
            console.log(`${e.id}  ${e.status}  ${e.title}`);
        }
    },
});
