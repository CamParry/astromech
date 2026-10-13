import { migrateToLatest } from '@astromech/schema-engine';
import { defineCommand } from 'citty';
import { checkedMigrationProvider } from '@/database/app-migrations';
import { assertForeignKeysEnforced } from '@/database/migrations';
import { getDb } from '@/database/registry';
import { AstromechError } from '@/errors/astromech-error';
import { configArgs, toAllowRemoteOption } from '../common-args';
import { loadConfig } from '../config';

export default defineCommand({
    meta: { name: 'db:init', description: 'Run database migrations' },
    args: {
        ...configArgs,
    },
    async run({ args }) {
        // `resolveConfig` strips `plugins` and `migrations`, so the raw config
        // gives both.
        const { config: rawConfig, resolved: config } = await loadConfig(
            args.config,
            toAllowRemoteOption(args)
        );
        const merged = await checkedMigrationProvider(rawConfig, config.migrationsDir);
        if (merged === null) {
            throw new AstromechError(
                `${config.migrationsDir} has no migrations. Run \`astromech db:generate\` first.`
            );
        }
        await assertForeignKeysEnforced(getDb());
        console.log('Running migrations...');
        // Plugin migrations merge into the app chain at apply time, so a newly
        // installed plugin can introduce a migration that sorts before ones
        // already applied, hence `allowUnorderedMigrations`.
        await migrateToLatest(getDb(), merged, { allowUnorderedMigrations: true });
        console.log('Database migrations applied');
    },
});
