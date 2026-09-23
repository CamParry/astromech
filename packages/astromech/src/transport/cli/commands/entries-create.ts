import type { Entry, EntryCreateData, EntryStatus, JsonObject } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, jsonArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';
import { parseJsonArg, printResult } from '../output';

export default defineCommand({
    meta: { name: 'entries:create', description: 'Create a new entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        title: { type: 'string', description: 'Entry title' },
        slug: { type: 'string', description: 'Entry slug' },
        locale: { type: 'string', description: 'Locale' },
        status: {
            type: 'string',
            description: 'Entry status (draft|published|scheduled)',
        },
        publishedAt: { type: 'string', description: 'Published-at ISO datetime' },
        fields: { type: 'string', description: 'Fields as inline JSON or @file' },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            const data: EntryCreateData = {};

            if (args.title !== undefined) data.title = args.title;
            if (args.slug !== undefined) data.slug = args.slug;
            if (args.locale !== undefined) data.locale = args.locale;
            if (args.status !== undefined) data.status = args.status as EntryStatus;
            if (args.publishedAt !== undefined)
                data.publishedAt = new Date(args.publishedAt);
            if (args.fields !== undefined) {
                data.fields = (await parseJsonArg(args.fields)) as JsonObject;
            }

            const entry = await callEntryMethod<Entry>(args.type, 'create', { data });

            printResult(entry, {
                json: args.json,
                text: () =>
                    console.log(`Created ${entry.type} ${entry.id} (${entry.status})`),
            });
        }),
});
