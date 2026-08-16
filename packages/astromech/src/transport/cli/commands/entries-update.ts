import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';
import { entriesService } from '@/entries/service';
import { printResult, printError, parseJsonArg } from '../output';
import type { EntryStatus, EntryUpdateData } from '@/types/index';
import type { JsonObject } from '@/types/index';

export default defineCommand({
    meta: { name: 'entries:update', description: 'Update an existing entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        title: { type: 'string', description: 'New title' },
        slug: { type: 'string', description: 'New slug' },
        status: { type: 'string', description: 'New status (draft|published|scheduled)' },
        publishAt: { type: 'string', description: 'Publish-at ISO datetime' },
        fields: { type: 'string', description: 'Fields as inline JSON or @file' },
        data: {
            type: 'string',
            description: 'Full EntryUpdateData as inline JSON or @file',
        },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        try {
            await loadConfig(args.config, toAllowRemoteOption(args));

            const base: EntryUpdateData = args.data
                ? ((await parseJsonArg(args.data)) as EntryUpdateData)
                : {};

            if (args.title !== undefined) base.title = args.title;
            if (args.slug !== undefined) base.slug = args.slug;
            if (args.status !== undefined) base.status = args.status as EntryStatus;
            if (args.publishAt !== undefined) base.publishAt = new Date(args.publishAt);
            if (args.fields !== undefined) {
                base.fields = (await parseJsonArg(args.fields)) as JsonObject;
            }

            const entry = await entriesService.update({
                type: args.type,
                id: args.id,
                data: base,
            });

            printResult(entry, {
                json: args.json,
                text: () => console.log(`Updated ${args.type} ${args.id}`),
            });
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
