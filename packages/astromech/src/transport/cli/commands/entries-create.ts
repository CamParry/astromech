import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { entriesService } from '@/entries/service.js';
import { printResult, printError, parseJsonArg } from '../output.js';
import type { EntryStatus } from '@/types/index.js';
import type { JsonObject } from '@/types/index.js';

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
        publishAt: { type: 'string', description: 'Publish-at ISO datetime' },
        fields: { type: 'string', description: 'Fields as inline JSON or @file' },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        try {
            await loadConfig(args.config);

            const params: Parameters<typeof entriesService.create>[0] = {
                type: args.type,
            };

            if (args.title !== undefined) params.title = args.title;
            if (args.slug !== undefined) params.slug = args.slug;
            if (args.locale !== undefined) params.locale = args.locale;
            if (args.status !== undefined) params.status = args.status as EntryStatus;
            if (args.publishAt !== undefined) params.publishAt = new Date(args.publishAt);
            if (args.fields !== undefined) {
                params.fields = (await parseJsonArg(args.fields)) as JsonObject;
            }

            const entry = await entriesService.create(params);

            printResult(entry, {
                json: args.json,
                text: () =>
                    console.log(`Created ${entry.type} ${entry.id} (${entry.status})`),
            });
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
