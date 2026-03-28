import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { usersApi } from '@/sdk/local/users.js';

export default defineCommand({
    meta: { name: 'users:list', description: 'List all users' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const users = await usersApi.all();
        if (users.length === 0) {
            console.log('No users found.');
            return;
        }
        for (const u of users) {
            console.log(`${u.id}  ${u.email}  ${u.name ?? ''}  ${u.roleSlug ?? ''}`);
        }
    },
});
