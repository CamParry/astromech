import { defineCommand } from 'citty';
import { configArgs, jsonArgs } from '../common-args';
import { withApplication } from '../config';
import { callCoreMethod } from '../methods';
import { printResult } from '../output';
import { confirm } from '../prompt';

export default defineCommand({
    meta: { name: 'users:delete', description: 'Delete a user' },
    args: {
        id: { type: 'positional', required: true, description: 'User ID' },
        force: { type: 'boolean', description: 'Skip confirmation', default: false },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            if (!args.force && !(await confirm(`Delete user ${args.id}?`))) {
                console.log('Cancelled.');
                return;
            }
            await callCoreMethod('users.delete', { id: args.id });
            printResult(
                { id: args.id },
                {
                    json: args.json,
                    text: () => console.log(`User ${args.id} deleted`),
                }
            );
        }),
});
