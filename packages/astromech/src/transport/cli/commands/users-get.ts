import { defineCommand } from 'citty';
import { usersService } from '@/users/service';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'users:get', description: 'Get a user by ID' },
    args: {
        id: { type: 'positional', required: true, description: 'User ID' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));
        const user = await usersService.get({ id: args.id });
        if (!user) {
            console.error('User not found');
            process.exit(1);
        }
        console.log(JSON.stringify(user, null, 2));
    },
});
