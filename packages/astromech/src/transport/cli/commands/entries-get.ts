import type { Entry } from '@/types/index';
import { defineCommand } from 'citty';
import { bootApplication } from '../config';
import { callEntryMethod } from '../methods';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'entries:get', description: 'Get a single entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        locale: {
            type: 'string',
            description: 'Locale to act on (defaults to the site default)',
        },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await bootApplication(args.config, toAllowRemoteOption(args));
        const entry = await callEntryMethod<Entry | null>(args.type, 'get', {
            id: args.id,
            ...(args.locale ? { locale: args.locale } : {}),
        });
        if (!entry) {
            console.error('Entry not found');
            process.exit(1);
        }
        console.log(JSON.stringify(entry, null, 2));
    },
});
