import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { usersApi } from '@/sdk/local/users.js';

export default defineCommand({
    meta: { name: 'users:get', description: 'Get a user by ID' },
    args: {
        id: { type: 'positional', required: true, description: 'User ID' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const user = await usersApi.get(args.id);
        if (!user) {
            console.error('User not found');
            process.exit(1);
        }
        console.log(JSON.stringify(user, null, 2));
    },
});
