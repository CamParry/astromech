import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { getDb } from '@/database/registry.js';
import { resolve } from 'node:path';

export default defineCommand({
    meta: { name: 'db:init', description: 'Run database migrations' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const db = getDb();
        const { migrate } = await import('drizzle-orm/libsql/migrator');
        const migrationsFolder = resolve(process.cwd(), 'drizzle');
        console.log('Running migrations...');
        await migrate(db, { migrationsFolder });
        console.log('Database migrations applied');
    },
});
