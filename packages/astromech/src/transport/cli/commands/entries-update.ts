import type { Entry, EntryStatus, EntryUpdateData, JsonObject } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, entryArgs, jsonArgs, localeArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';
import { parseJsonArg, printResult } from '../output';

export default defineCommand({
    meta: { name: 'entries:update', description: 'Update an existing entry' },
    args: {
        ...entryArgs,
        ...localeArgs,
        title: { type: 'string', description: 'New title' },
        slug: { type: 'string', description: 'New slug' },
        status: { type: 'string', description: 'New status (draft|published|scheduled)' },
        publishedAt: { type: 'string', description: 'Published-at ISO datetime' },
        fields: { type: 'string', description: 'Fields as inline JSON or @file' },
        data: {
            type: 'string',
            description: 'Full EntryUpdateData as inline JSON or @file',
        },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            const base: EntryUpdateData = args.data
                ? ((await parseJsonArg(args.data)) as EntryUpdateData)
                : {};

            if (args.title !== undefined) base.title = args.title;
            if (args.slug !== undefined) base.slug = args.slug;
            if (args.status !== undefined) base.status = args.status as EntryStatus;
            if (args.publishedAt !== undefined)
                base.publishedAt = new Date(args.publishedAt);
            if (args.fields !== undefined) {
                base.fields = (await parseJsonArg(args.fields)) as JsonObject;
            }

            // A locale with no content row yet is created, so this is also
            // how the CLI writes a translation.
            const entry = await callEntryMethod<Entry>(args.type, 'update', {
                id: args.id,
                ...(args.locale ? { locale: args.locale } : {}),
                data: base,
            });

            printResult(entry, {
                json: args.json,
                text: () => console.log(`Updated ${args.type} ${args.id}`),
            });
        }),
});
