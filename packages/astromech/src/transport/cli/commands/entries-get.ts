import type { Entry } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';

export default defineCommand({
    meta: { name: 'entries:get', description: 'Get a single entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        locale: {
            type: 'string',
            description: 'Locale to act on (defaults to the site default)',
        },
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            const entry = await callEntryMethod<Entry | null>(args.type, 'get', {
                id: args.id,
                ...(args.locale ? { locale: args.locale } : {}),
            });
            if (!entry) throw new Error('Entry not found');
            console.log(JSON.stringify(entry, null, 2));
        }),
});
