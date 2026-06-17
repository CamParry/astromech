import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { getDb } from '@/db/registry.js';
import { sql } from 'drizzle-orm';

export default defineCommand({
    meta: { name: 'db:status', description: 'Show migration status' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        await loadConfig(args.config);
        const db = getDb();
        try {
            const rows = await db.run(sql`SELECT * FROM __drizzle_migrations ORDER BY created_at`);
            console.log('Applied migrations:');
            for (const row of (rows.rows ?? [])) {
                console.log(`  ${(row as Record<string, unknown>)['hash']}`);
            }
        } catch {
            console.log('No migrations table found. Run db:init first.');
        }
    },
});
