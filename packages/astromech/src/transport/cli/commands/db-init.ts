import { migrateToLatest } from '@astromech/schema-engine';
import { defineCommand } from 'citty';
import { assertForeignKeysEnforced, loadMergedProvider } from '@/database/migrations';
import { getDb } from '@/database/registry';
import { configArgs, toAllowRemoteOption } from '../common-args';
import { loadConfig } from '../config';

export default defineCommand({
    meta: { name: 'db:init', description: 'Run database migrations' },
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
        // Plugin migrations merge into the app chain at apply time, so a newly
        // installed plugin can introduce a migration that sorts before ones
        // already applied — hence `allowUnorderedMigrations`.
        const merged = await loadMergedProvider(
            rawConfig.plugins ?? [],
            config.migrationsDir
        );
        await assertForeignKeysEnforced(getDb());
        console.log('Running migrations...');
        await migrateToLatest(getDb(), merged, { allowUnorderedMigrations: true });
        console.log('Database migrations applied');
    },
});
