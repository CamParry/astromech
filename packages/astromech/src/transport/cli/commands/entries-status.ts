/** `entries:publish` and `entries:unpublish`: the two status moves, one entry at a time. */

import type { Entry } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, entryArgs, jsonArgs, localeArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';
import { printResult } from '../output';

/** A command calling `entries.<method>` on one entry, reporting `done` on success. */
function statusCommand(params: {
    name: string;
    description: string;
    method: 'publish' | 'unpublish';
    done: string;
}) {
    return defineCommand({
        meta: { name: params.name, description: params.description },
        args: {
            ...entryArgs,
            ...localeArgs,
            ...jsonArgs,
            ...configArgs,
        },
        run: ({ args }) =>
            withApplication(args, async () => {
                const entry = await callEntryMethod<Entry>(args.type, params.method, {
                    id: args.id,
                    ...(args.locale ? { locale: args.locale } : {}),
                });
                printResult(entry, {
                    json: args.json,
                    text: () => console.log(`${params.done} ${args.type} ${args.id}`),
                });
            }),
    });
}

export const publishCommand = statusCommand({
    name: 'entries:publish',
    description: 'Publish an entry',
    method: 'publish',
    done: 'Published',
});

export const unpublishCommand = statusCommand({
    name: 'entries:unpublish',
    description: 'Unpublish an entry (revert to draft)',
    method: 'unpublish',
    done: 'Unpublished',
});
