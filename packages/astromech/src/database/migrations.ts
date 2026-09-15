import type { DB } from '@/database/types';
import type { PluginDefinition } from '@/types/index';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { loadAppMigrations } from '@/database/app-migrations';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { AstromechError } from '@/errors/astromech-error';
import { log } from '@/utilities/log';

/**
 * Migrations at the two moments the runtime touches them: applying the chain on
 * demand, and reporting drift when the application boots.
 */

export type MigrationLogger = {
    info: (message: string) => void;
    error: (message: string) => void;
};

/**
 * Throw unless the database enforces foreign keys. Deleting a user relies on
 * them: `ON DELETE set null` clears the author columns that point at the user,
 * and `ON DELETE cascade` removes their sessions, accounts, content rows and
 * notifications.
 *
 * The check lives in the migration runner because every site runs it against
 * the same database it serves, and whether foreign keys are on is the
 * database's own default: a remote libSQL client cannot turn it on, since each
 * query gets a stream of its own. The schema layer is SQLite-only already (its
 * table rebuilds emit `PRAGMA defer_foreign_keys`), so this reads the SQLite
 * pragma directly.
 */
export async function assertForeignKeysEnforced(db: Kysely<DB>): Promise<void> {
    const { rows } = await sql<Record<string, unknown>>`PRAGMA foreign_keys`.execute(db);
    const [row] = rows;
    // Read by position: `CamelCasePlugin` renames the pragma's column.
    const value = row === undefined ? undefined : Object.values(row)[0];
    if (Number(value) === 1) return;
    throw new AstromechError(
        `The database does not enforce foreign keys (PRAGMA foreign_keys is ${value === undefined ? 'empty' : String(value)}). ` +
            "Astromech relies on them to clear and delete a deleted user's rows. " +
            'Use a libSQL or D1 database with foreign keys on.'
    );
}

/**
 * Apply the app chain, merged with every plugin's, to the latest migration,
 * after checking the database enforces foreign keys. A missing provider is
 * reported and skipped, because `db:init` is the primary migration path; a
 * failed migration throws, because the caller would otherwise carry on against
 * a stale schema.
 */
export async function runMigrations(
    db: Kysely<DB>,
    logger: MigrationLogger,
    plugins: PluginDefinition[]
): Promise<void> {
    await assertForeignKeysEnforced(db);

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
