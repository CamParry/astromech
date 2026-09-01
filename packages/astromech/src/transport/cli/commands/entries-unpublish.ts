import { defineCommand } from 'citty';
import { entriesService } from '@/entries/service';
import { loadConfig } from '../config';
import { printError, printResult } from '../output';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: {
        name: 'entries:unpublish',
        description: 'Unpublish an entry (revert to draft)',
    },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        locale: {
            type: 'string',
            description: 'Locale to act on (defaults to the site default)',
        },
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
                ...(args.locale ? { locale: args.locale } : {}),
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
