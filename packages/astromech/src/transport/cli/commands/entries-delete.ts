import { defineCommand } from 'citty';
import { configArgs, jsonArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';
import { printResult } from '../output';
import { confirm } from '../prompt';

export default defineCommand({
    meta: { name: 'entries:delete', description: 'Permanently delete an entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        force: { type: 'boolean', description: 'Skip confirmation', default: false },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            if (!args.force && !(await confirm(`Permanently delete entry ${args.id}?`))) {
                console.log('Cancelled.');
                return;
            }
            await callEntryMethod(args.type, 'delete', { id: args.id });
            printResult(
                { id: args.id },
                {
                    json: args.json,
                    text: () => console.log(`Entry ${args.id} deleted`),
                }
            );
        }),
});
