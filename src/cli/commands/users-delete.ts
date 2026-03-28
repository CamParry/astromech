import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { usersApi } from '@/sdk/local/users.js';

export default defineCommand({
    meta: { name: 'users:delete', description: 'Delete a user' },
    args: {
        id: { type: 'positional', required: true, description: 'User ID' },
        force: { type: 'boolean', description: 'Skip confirmation', default: false },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        if (!args.force) {
            const readline = await import('node:readline/promises');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await rl.question(`Delete user ${args.id}? (y/N) `);
            rl.close();
            if (answer.toLowerCase() !== 'y') {
                console.log('Cancelled.');
                return;
            }
        }
        await usersApi.delete(args.id);
        console.log(`User ${args.id} deleted`);
    },
});
