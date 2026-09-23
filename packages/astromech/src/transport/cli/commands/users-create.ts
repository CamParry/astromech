import type { User } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, jsonArgs } from '../common-args';
import { withApplication } from '../config';
import { callCoreMethod } from '../methods';
import { printResult } from '../output';
import { ask } from '../prompt';

export default defineCommand({
    meta: { name: 'users:create', description: 'Create a new user' },
    args: {
        name: { type: 'string', description: 'User name' },
        email: { type: 'string', description: 'Email address' },
        password: { type: 'string', description: 'Password' },
        role: { type: 'string', description: 'Role slug', default: 'admin' },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            // Prompt for whichever of the three the flags left out.
            const given = { name: args.name, email: args.email, password: args.password };
            const missing = Object.entries(given).filter(([, value]) => !value);
            const answers = await ask(missing.map(([key]) => `${capitalise(key)}: `));
            const { name, email, password } = {
                ...given,
                ...Object.fromEntries(missing.map(([key], i) => [key, answers[i]])),
            };

            // `users.create` checks the role against the config and writes the
            // user, its content row and its credential account in one transaction.
            const user = await callCoreMethod<User>('users.create', {
                data: { name, email, password, role: args.role ?? 'admin' },
            });
            printResult(user, {
                json: args.json,
                text: () => console.log(`User created: ${user.email} (${user.id})`),
            });
        }),
});

/** `name` → `Name`, for a prompt. */
function capitalise(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
