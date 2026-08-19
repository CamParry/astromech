import type { DB } from '@/database/types';
import type { Insertable } from 'kysely';
import { defineCommand } from 'citty';
import { encode } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createUserStorage } from '@/users/storage';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'users:create', description: 'Create a new user' },
    args: {
        name: { type: 'string', description: 'User name' },
        email: { type: 'string', description: 'Email address' },
        password: { type: 'string', description: 'Password' },
        role: { type: 'string', description: 'Role slug', default: 'admin' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));

        let { name, email, password } = args;
        const roleSlug = args.role ?? 'admin';

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

        const { hashPassword } = await import('better-auth/crypto');
        const db = getDb();
        const now = new Date();
        const userId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const hashedPassword = await hashPassword(password);

        await createUserStorage().create({
            id: userId,
            email,
            name,
            emailVerified: true,
            roleSlug,
            createdAt: now,
            updatedAt: now,
        });

        // `accounts` is a better-auth table with no storage layer of its own, and
        // it is not the `users` domain's to own — so this one insert stays raw.
        await db
            .insertInto('accounts')
            .values(
                encode('accounts', {
                    id: accountId,
                    accountId: userId,
                    providerId: 'credential',
                    userId,
                    password: hashedPassword,
                    createdAt: now,
                    updatedAt: now,
                }) as unknown as Insertable<DB['accounts']>
            )
            .execute();

        console.log(`User created: ${email} (${userId})`);
    },
});
