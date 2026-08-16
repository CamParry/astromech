import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { toForceOption } from '../force-args';
import { entriesService } from '@/entries/service';

export default defineCommand({
    meta: { name: 'entries:delete', description: 'Permanently delete an entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        // One `--force` for both meanings: skip the confirmation prompt, and
        // allow a remote database. `forceArgs` is not spread in — it would
        // redeclare this flag.
        force: {
            type: 'boolean',
            description: 'Skip confirmation and allow a remote database.',
            default: false,
        },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config, toForceOption(args));
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
        await entriesService.delete({ type: args.type, id: args.id });
        console.log(`Entry ${args.id} deleted`);
    },
});
