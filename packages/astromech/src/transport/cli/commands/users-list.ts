import { defineCommand } from 'citty';
import { usersService } from '@/users/service';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'users:list', description: 'List all users' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));
        const result = await usersService.query({ limit: 'all' });
        const users = result.data;
        if (users.length === 0) {
            console.log('No users found.');
            return;
        }
        for (const u of users) {
            console.log(`${u.id}  ${u.email}  ${u.name ?? ''}  ${u.roleSlug ?? ''}`);
        }
    },
});
