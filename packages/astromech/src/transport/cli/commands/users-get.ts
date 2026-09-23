import type { User } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs } from '../common-args';
import { withApplication } from '../config';
import { callCoreMethod } from '../methods';

export default defineCommand({
    meta: { name: 'users:get', description: 'Get a user by ID' },
    args: {
        id: { type: 'positional', required: true, description: 'User ID' },
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            const user = await callCoreMethod<User | null>('users.get', { id: args.id });
            if (!user) throw new Error('User not found');
            console.log(JSON.stringify(user, null, 2));
        }),
});
