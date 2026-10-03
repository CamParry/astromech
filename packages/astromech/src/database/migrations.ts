import type { DB } from '@/database/types';
import type { PluginDefinition } from '@/types/index';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import {
    hasAppMigrations,
    loadAppMigrations,
    resolveMigrationsDir,
} from '@/database/app-migrations';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { AstromechError } from '@/errors/astromech-error';
import { log } from '@/utilities/log';
import { pluralise } from '@/utilities/strings';

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
 * a stale schema. `migrationsDir` is the resolved config's.
 */
export async function runMigrations(
    db: Kysely<DB>,
    logger: MigrationLogger,
    plugins: PluginDefinition[],
    migrationsDir: string
): Promise<void> {
    await assertForeignKeysEnforced(db);

    let provider: MigrationProvider;
    try {
        provider = await loadMergedProvider(plugins, migrationsDir);
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
 * races every other replica. `migrationsDir` is the resolved config's.
 */
export async function checkMigrationDrift(
    db: Kysely<DB>,
    plugins: PluginDefinition[],
    migrationsDir: string
): Promise<void> {
    let provider: MigrationProvider;
    try {
        provider = await loadMergedProvider(plugins, migrationsDir);
    } catch (error) {
        // Quiet when there is no chain: a bundled runtime ships none, and a new
        // site may not have run `db:generate` yet.
        if (await hasAppMigrations(resolveMigrationsDir(migrationsDir))) {
            log.error(
                'could not load the migrations, so the database was not checked ' +
                    `for pending ones: ${describe(error)}`
            );
        }
        return;
    }

    const pending = await listPendingMigrations(db, provider);
    if (pending.length === 0) return;

    log.warn(
        `${pluralise(pending.length, 'migration')} ${pending.length === 1 ? 'has' : 'have'} ` +
            'not been applied to this ' +
            `database: ${pending.join(', ')}. ` +
            'Run `astromech db:init`.'
    );
}

/** The names of the migrations in `provider` that `db` has not applied, in apply order. */
export async function listPendingMigrations(
    db: Kysely<DB>,
    provider: MigrationProvider
): Promise<string[]> {
    const migrator = new Migrator({ db, provider, allowUnorderedMigrations: true });
    return (await migrator.getMigrations())
        .filter((migration) => migration.executedAt === undefined)
        .map((migration) => migration.name);
}

/** The app's own migrations with each plugin's merged in, as one provider. */
export async function loadMergedProvider(
    plugins: PluginDefinition[],
    migrationsDir: string
): Promise<MigrationProvider> {
    // Plugin migrations merge at apply time, so a newly installed plugin can
    // introduce a migration that sorts before ones already applied — which is
    // why every caller here passes `allowUnorderedMigrations`.
    return mergeMigrationProviders(
        await loadAppMigrations(resolveMigrationsDir(migrationsDir)),
        collectPluginMigrations(plugins)
    );
}

/**
 * The merged chain as a provider that loads it on each read, so boot can
 * register it without loading files a bundled runtime may not ship.
 */
export function createMergedProvider(
    plugins: PluginDefinition[],
    migrationsDir: string
): MigrationProvider {
    return {
        async getMigrations() {
            let provider: MigrationProvider;
            try {
                provider = await loadMergedProvider(plugins, migrationsDir);
            } catch (error) {
                throw new AstromechError(
                    `could not load the migrations from ${migrationsDir}: ${describe(error)}`
                );
            }
            return provider.getMigrations();
        },
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
