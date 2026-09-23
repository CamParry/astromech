import type { QueryResult, User } from '@/types/index';
import { defineCommand } from 'citty';
import { bootApplication } from '../config';
import { callCoreMethod } from '../methods';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'users:list', description: 'List all users' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await bootApplication(args.config, toAllowRemoteOption(args));
        const result = await callCoreMethod<QueryResult<User>>('users.query', {
            limit: 'all',
        });
        const users = result.data;
        if (users.length === 0) {
            console.log('No users found.');
            return;
        }
        for (const u of users) {
            console.log(`${u.id}  ${u.email}  ${u.name ?? ''}  ${u.role ?? ''}`);
        }
    },
});
