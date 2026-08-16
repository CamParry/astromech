import { defineCommand } from 'citty';
import { loadConfig } from '../config';
import { forceArgs, toForceOption } from '../force-args';
import { getDb } from '@/database/registry';

export default defineCommand({
    meta: { name: 'db:status', description: 'Show migration status' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...forceArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toForceOption(args));
        const db = getDb();
        try {
            const rows = await db
                .selectFrom('kysely_migration' as never)
                .select(['name', 'timestamp'] as never)
                .orderBy('timestamp' as never)
                .execute();
            console.log('Applied migrations:');
            for (const row of rows) {
                console.log(`  ${(row as Record<string, unknown>)['name']}`);
            }
        } catch {
            console.log('No migrations table found. Run db:init first.');
        }
    },
});
