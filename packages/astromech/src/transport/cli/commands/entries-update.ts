import type { EntryStatus, EntryUpdateData, JsonObject } from '@/types/index';
import { defineCommand } from 'citty';
import { entriesService } from '@/entries/service';
import { loadConfig } from '../config';
import { parseJsonArg, printError, printResult } from '../output';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'entries:update', description: 'Update an existing entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        locale: {
            type: 'string',
            description: 'Locale to act on (defaults to the site default)',
        },
        title: { type: 'string', description: 'New title' },
        slug: { type: 'string', description: 'New slug' },
        status: { type: 'string', description: 'New status (draft|published|scheduled)' },
        publishedAt: { type: 'string', description: 'Published-at ISO datetime' },
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
            if (args.publishedAt !== undefined)
                base.publishedAt = new Date(args.publishedAt);
            if (args.fields !== undefined) {
                base.fields = (await parseJsonArg(args.fields)) as JsonObject;
            }

            // A locale with no content row yet is created, so this is also
            // how the CLI writes a translation.
            const entry = await entriesService.update({
                type: args.type,
                id: args.id,
                ...(args.locale ? { locale: args.locale } : {}),
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
