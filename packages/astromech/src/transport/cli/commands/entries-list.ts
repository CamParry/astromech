import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';
import { entriesService } from '@/entries/service';
import { printResult } from '../output';

export default defineCommand({
    meta: { name: 'entries:list', description: 'List entries for a given type' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        status: { type: 'string', description: 'Filter by status' },
        limit: { type: 'string', description: 'Max results', default: '20' },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));
        const limitNum = parseInt(args.limit, 10);
        const { data } = await entriesService.query({
            type: args.type,
            limit: limitNum,
            ...(args.status ? { where: { status: args.status } } : {}),
        });
        printResult(data, {
            json: args.json,
            text: () => {
                if (data.length === 0) {
                    console.log('No entries found.');
                    return;
                }
                for (const e of data) {
                    console.log(`${e.id}  ${e.status}  ${e.title}`);
                }
            },
        });
    },
});
