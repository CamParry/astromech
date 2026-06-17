import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { getDb } from '@/db/registry.js';
import { usersTable, accountsTable } from '@/db/schema.js';

export default defineCommand({
    meta: { name: 'users:create', description: 'Create a new user' },
    args: {
        name: { type: 'string', description: 'User name' },
        email: { type: 'string', description: 'Email address' },
        password: { type: 'string', description: 'Password' },
        role: { type: 'string', description: 'Role slug', default: 'admin' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);

        let { name, email, password } = args;
        const roleSlug = args.role ?? 'admin';

        if (!name || !email || !password) {
            const readline = await import('node:readline/promises');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            name = name || await rl.question('Name: ');
            email = email || await rl.question('Email: ');
            password = password || await rl.question('Password: ');
            rl.close();
        }

        const { hashPassword } = await import('better-auth/crypto');
        const db = getDb();
        const now = new Date();
        const userId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const hashedPassword = await hashPassword(password);

        await db.insert(usersTable).values({
            id: userId,
            email,
            name,
            emailVerified: true,
            roleSlug,
            createdAt: now,
            updatedAt: now,
        });

        await db.insert(accountsTable).values({
            id: accountId,
            accountId: userId,
            providerId: 'credential',
            userId,
            password: hashedPassword,
            createdAt: now,
            updatedAt: now,
        });

        console.log(`User created: ${email} (${userId})`);
    },
});
