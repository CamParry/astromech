/**
 * Kysely migration runner.
 *
 * Thin wrapper over Kysely's `Migrator` that runs a `MigrationProvider` to the
 * latest migration and throws (surfacing the underlying error, named by the
 * migration that failed) if any step fails. The caller supplies the provider —
 * typically the generated `migrationProvider` that `generate.ts` writes into an
 * app's `migrations/index.ts`.
 */

import { Migrator, type Kysely, type MigrationProvider } from 'kysely';

export async function migrateToLatest<T>(
    db: Kysely<T>,
    provider: MigrationProvider
): Promise<void> {
    const migrator = new Migrator({ db, provider });
    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
        if (result.status === 'Error') {
            throw new Error(
                `migration "${result.migrationName}" failed` +
                    (error instanceof Error ? `: ${error.message}` : '')
            );
        }
    }

    if (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}
