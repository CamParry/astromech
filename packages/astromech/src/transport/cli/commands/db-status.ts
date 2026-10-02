import { defineCommand } from 'citty';
import { DEFAULT_MIGRATION_TABLE } from 'kysely/migration';
import { listPendingMigrations, loadMergedProvider } from '@/database/migrations';
import { getDb } from '@/database/registry';
import { configArgs, toAllowRemoteOption } from '../common-args';
import { loadConfig } from '../config';
import { printError } from '../output';

export default defineCommand({
    meta: { name: 'db:status', description: 'Show migration status' },
    args: {
        ...configArgs,
    },
    async run({ args }) {
        // `resolveConfig` strips `plugins`, so the raw config gives the plugin
        // definitions.
        const { config: rawConfig, resolved: config } = await loadConfig(
            args.config,
            toAllowRemoteOption(args)
        );
        const db = getDb();
        try {
            const tables = await db.introspection.getTables({
                withInternalKyselyTables: true,
            });
            if (!tables.some((table) => table.name === DEFAULT_MIGRATION_TABLE)) {
                console.log('No migrations table found. Run db:init first.');
                return;
            }

            const rows = await db
                .selectFrom(DEFAULT_MIGRATION_TABLE as never)
                .select(['name', 'timestamp'] as never)
                .orderBy('timestamp' as never)
                .execute();
            const pending = await listPendingMigrations(
                db,
                await loadMergedProvider(rawConfig.plugins ?? [], config.migrationsDir)
            );

            console.log('Applied migrations:');
            for (const row of rows) {
                console.log(`  ${(row as Record<string, unknown>)['name']}`);
            }
            if (pending.length > 0) {
                console.log('Pending migrations:');
                for (const name of pending) console.log(`  ${name}`);
            }
        } catch (error) {
            printError(error, { json: false });
        }
    },
});
