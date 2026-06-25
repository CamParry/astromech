import { defineCommand } from 'citty';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { getDb } from '@/database/registry.js';
import { migrateToLatest } from '@/database/migrator.js';

export default defineCommand({
    meta: { name: 'db:init', description: 'Run database migrations' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const { baselineProvider } = await import(
            pathToFileURL(resolve(process.cwd(), 'drizzle/baseline.ts')).href
        );
        console.log('Running migrations...');
        await migrateToLatest(getDb(), baselineProvider);
        console.log('Database migrations applied');
    },
});
