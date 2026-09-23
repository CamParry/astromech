import type { User } from '@/types/index';
import { defineCommand } from 'citty';
import { bootApplication } from '../config';
import { callCoreMethod } from '../methods';
import { describeCallError, printError } from '../output';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'users:create', description: 'Create a new user' },
    args: {
        name: { type: 'string', description: 'User name' },
        email: { type: 'string', description: 'Email address' },
        password: { type: 'string', description: 'Password' },
        role: { type: 'string', description: 'Role slug', default: 'admin' },
        json: { type: 'boolean', default: false, description: 'Report errors as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        try {
            await bootApplication(args.config, toAllowRemoteOption(args));

            let { name, email, password } = args;
            if (!name || !email || !password) {
                const readline = await import('node:readline/promises');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
                name = name || (await rl.question('Name: '));
                email = email || (await rl.question('Email: '));
                password = password || (await rl.question('Password: '));
                rl.close();
            }

            // `users.create` checks the role against the config and writes the
            // user, its content row and its credential account in one transaction.
            const user = await callCoreMethod<User>('users.create', {
                data: { name, email, password, role: args.role ?? 'admin' },
            });
            console.log(`User created: ${user.email} (${user.id})`);
        } catch (e) {
            printError(describeCallError(e), { json: args.json });
        }
    },
});
