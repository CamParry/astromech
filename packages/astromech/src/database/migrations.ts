import type { DB } from '@/database/types';
import type { PluginDefinition } from '@/types/index';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { collectPluginMigrations } from '@/database/plugin-migrations';
import { AstromechError } from '@/errors/astromech-error';
import { log } from '@/utilities/log';
import { pluralise } from '@/utilities/strings';

/**
 * The migration chain the config holds, merged with each plugin's, at the two
 * moments the runtime touches it: applying it on demand, and reporting drift
 * when the application boots. Nothing here reads a file, so a Worker runs it.
 */

export type MigrationLogger = {
    info: (message: string) => void;
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

/** The app's chain merged with each plugin's, as one provider. */
export function createMergedProvider(
    app: MigrationProvider,
    plugins: PluginDefinition[]
): MigrationProvider {
    // Plugin migrations merge at apply time, so a newly installed plugin can
    // introduce a migration that sorts before ones already applied, which is
    // why every caller here passes `allowUnorderedMigrations`.
    return mergeMigrationProviders(app, collectPluginMigrations(plugins));
}

/**
 * Apply `provider` to the latest migration, after checking the database
 * enforces foreign keys. A failed migration throws, because the caller would
 * otherwise carry on against a stale schema.
 */
export async function runMigrations(
    db: Kysely<DB>,
    logger: MigrationLogger,
    provider: MigrationProvider
): Promise<void> {
    await assertForeignKeysEnforced(db);
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
    provider: MigrationProvider
): Promise<void> {
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
