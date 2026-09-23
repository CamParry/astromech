import { defineCommand } from 'citty';
import { bootApplication } from '../config';
import { callEntryMethod } from '../methods';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'entries:delete', description: 'Permanently delete an entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        force: { type: 'boolean', description: 'Skip confirmation', default: false },
        ...allowRemoteArgs,
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await bootApplication(args.config, toAllowRemoteOption(args));
        if (!args.force) {
            const readline = await import('node:readline/promises');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            const answer = await rl.question(
                `Permanently delete entry ${args.id}? (y/N) `
            );
            rl.close();
            if (answer.toLowerCase() !== 'y') {
                console.log('Cancelled.');
                return;
            }
        }
        await callEntryMethod(args.type, 'delete', { id: args.id });
        console.log(`Entry ${args.id} deleted`);
    },
});
