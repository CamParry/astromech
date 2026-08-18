/**
 * Migrations at the two moments the runtime touches them: applying the chain on
 * demand, and reporting drift when the application boots.
 */

import { Migrator, type Kysely, type MigrationProvider } from 'kysely';
import type { DB } from '@/database/types';
import type { PluginDefinition } from '@/types/index';
import { migrateToLatest, mergeMigrationProviders } from '@astromech/schema-engine';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { loadAppMigrations } from '@/database/app-migrations';
import { log } from '@/utilities/log';

export type MigrationLogger = {
    info: (message: string) => void;
    error: (message: string) => void;
};

/**
 * Apply the app chain, merged with every plugin's, to the latest migration.
 * A missing provider is reported and skipped, because `db:init` is the primary
 * migration path; a failed migration throws, because the caller would otherwise
 * carry on against a stale schema.
 */
export async function runMigrations(
    db: Kysely<DB>,
    logger: MigrationLogger,
    plugins: PluginDefinition[]
): Promise<void> {
    let provider: MigrationProvider;
    try {
        provider = await loadMergedProvider(plugins);
    } catch (error) {
        logger.error(`Astromech could not load its migrations: ${describe(error)}`);
        return;
    }

    await migrateToLatest(db, provider, { allowUnorderedMigrations: true });
    logger.info('Astromech database migrations applied');
}

/**
 * Warn when the database is behind the migration chain. Reads only: applying
 * the difference is `db:init`'s job, and a serving process that migrates itself
 * races every other replica.
 */
export async function checkMigrationDrift(
    db: Kysely<DB>,
    plugins: PluginDefinition[]
): Promise<void> {
    let provider: MigrationProvider;
    try {
        provider = await loadMergedProvider(plugins);
    } catch {
        // No migrations directory to compare against — a bundled runtime ships
        // none, and the app may not have run `db:generate` yet.
        return;
    }

    const migrator = new Migrator({ db, provider, allowUnorderedMigrations: true });
    const pending = (await migrator.getMigrations()).filter(
        (migration) => migration.executedAt === undefined
    );
    if (pending.length === 0) return;

    log.warn(
        `${pending.length} migration(s) have not been applied to this ` +
            `database: ${pending.map((migration) => migration.name).join(', ')}. ` +
            'Run `astromech db:init`.'
    );
}

/** The app's own migrations with each plugin's merged in, as one provider. */
async function loadMergedProvider(
    plugins: PluginDefinition[]
): Promise<MigrationProvider> {
    // Plugin migrations merge at apply time, so a newly installed plugin can
    // introduce a migration that sorts before ones already applied — which is
    // why every caller here passes `allowUnorderedMigrations`.
    return mergeMigrationProviders(
        await loadAppMigrations(),
        collectPluginMigrations(plugins)
    );
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
