/**
 * How the run's template database is opened and which migrations it gets.
 *
 * `global-setup.ts` uses both to build the migrated template; `harness.ts`
 * opens each copy of it through the `libsql` driver a site runs. This module
 * must not call `inject`, because global setup runs in the main process, where
 * `inject` is unavailable.
 */
import type { DB } from '@/database/types';
import type { Client } from '@libsql/client';
import type { MigrationProvider } from 'kysely/migration';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely } from 'kysely';

/** Plugins whose generated baselines the test database's chain includes. */
export const FIRST_PARTY_PLUGIN_MIGRATIONS = [
    'redirects',
    'backups',
    'forms',
    'assistant',
] as const;

/**
 * A Kysely instance over `client`, set up the way the libsql driver sets up a
 * site's. The template needs its own client because the driver has no way to
 * close one. Destroying it does not close `client`; the caller does that.
 */
export function openTestDb(client: Client): Kysely<DB> {
    return new Kysely<DB>({
        // `@libsql/kysely-libsql` pins an older `@libsql/core` Client type; the
        // runtime client is compatible (see the libsql driver).
        dialect: new LibsqlDialect({ client: client as never }),
        plugins: [new CamelCasePlugin()],
    });
}

/**
 * Apply the full migration chain a site with the first-party plugins gets:
 * `apps/demo/migrations` merged with each plugin's own chain. Running the real
 * chain (rather than a test-only schema) means every harness-based test also
 * exercises the generated `migrationProvider`.
 *
 * The migration providers live outside this package's rootDir, so they are
 * imported dynamically by URL (vitest resolves the .ts) to keep `apps/demo` and
 * the plugins out of the tsconfig project.
 */
export async function migrateTestDb(db: Kysely<DB>): Promise<void> {
    const { migrationProvider } = await import(
        new URL('../../../../apps/demo/migrations/index.ts', import.meta.url).href
    );
    // The first-party plugins own their tables, so the app chain alone does not
    // create them. Apply exactly what a real boot applies: the merged provider.
    // `allowUnorderedMigrations` mirrors `database/migrations.ts`, because plugin
    // migrations interleave with the app's in one `kysely_migration` table.
    const plugins = await Promise.all(
        FIRST_PARTY_PLUGIN_MIGRATIONS.map(async (alias) => {
            const mod = await import(
                new URL(`../../../plugins/${alias}/migrations/index.ts`, import.meta.url)
                    .href
            );
            return { alias, provider: mod.migrationProvider as MigrationProvider };
        })
    );
    await migrateToLatest(db, mergeMigrationProviders(migrationProvider, plugins), {
        allowUnorderedMigrations: true,
    });
}
