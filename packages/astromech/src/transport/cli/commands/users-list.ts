import type { QueryResult, User } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, jsonArgs } from '../common-args';
import { withApplication } from '../config';
import { callCoreMethod } from '../methods';
import { printResult } from '../output';

export default defineCommand({
    meta: { name: 'users:list', description: 'List all users' },
    args: { ...jsonArgs, ...configArgs },
    run: ({ args }) =>
        withApplication(args, async () => {
            const { data } = await callCoreMethod<QueryResult<User>>('users.query', {
                limit: 'all',
            });
            printResult(data, {
                json: args.json,
                text: () => {
                    if (data.length === 0) {
                        console.log('No users found.');
                        return;
                    }
                    for (const u of data) {
                        console.log(
                            `${u.id}  ${u.email}  ${u.name ?? ''}  ${u.role ?? ''}`
                        );
                    }
                },
            });
        }),
});
