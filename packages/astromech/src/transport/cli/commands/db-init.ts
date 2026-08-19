import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { defineCommand } from 'citty';
import { loadAppMigrations } from '@/database/app-migrations';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { getDb } from '@/database/registry';
import { loadConfig, loadRawConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: { name: 'db:init', description: 'Run database migrations' },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));
        // `resolveConfig` strips `plugins`, so read the raw config for the
        // plugin definitions (same pattern as generate-types / generate-manifest).
        const rawConfig = await loadRawConfig(args.config);
        const migrationProvider = await loadAppMigrations();
        // Plugin migrations merge into the app chain at apply time, so a newly
        // installed plugin can introduce a migration that sorts before ones
        // already applied — hence `allowUnorderedMigrations`.
        const merged = mergeMigrationProviders(
            migrationProvider,
            collectPluginMigrations(rawConfig.plugins ?? [])
        );
        console.log('Running migrations...');
        await migrateToLatest(getDb(), merged, { allowUnorderedMigrations: true });
        console.log('Database migrations applied');
    },
});
