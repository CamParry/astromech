import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { entries } from '@/sdk/local/entries.js';

export default defineCommand({
    meta: { name: 'entries:delete', description: 'Permanently delete an entry' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        id: { type: 'positional', required: true, description: 'Entry ID' },
        force: { type: 'boolean', description: 'Skip confirmation', default: false },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        if (!args.force) {
            const readline = await import('node:readline/promises');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await rl.question(`Permanently delete entry ${args.id}? (y/N) `);
            rl.close();
            if (answer.toLowerCase() !== 'y') {
                console.log('Cancelled.');
                return;
            }
        }
        await entries.delete(args.id);
        console.log(`Entry ${args.id} deleted`);
    },
});
