/**
 * Kysely migration runner.
 *
 * Thin wrapper over Kysely's `Migrator` that runs a `MigrationProvider` to the
 * latest migration and throws (surfacing the underlying error) if any step
 * fails. The app supplies the provider — `<app>/migrations/index.ts`'s
 * generated `migrationProvider` (`database/generator.ts` writes it; the
 * hand-authored `0000_baseline` is its one non-generated entry).
 */

import { Migrator, type Kysely, type MigrationProvider } from 'kysely';
import type { DB } from '@/database/types.js';

export async function migrateToLatest(
    db: Kysely<DB>,
    provider: MigrationProvider
): Promise<void> {
    const migrator = new Migrator({ db, provider });
    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
        if (result.status === 'Error') {
            throw new Error(
                `[Astromech] migration "${result.migrationName}" failed` +
                    (error instanceof Error ? `: ${error.message}` : '')
            );
        }
    }

    if (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}
