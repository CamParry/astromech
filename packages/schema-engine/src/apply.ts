import type { Kysely, Migration, MigrationProvider } from 'kysely';
import { Migrator } from 'kysely';

/**
 * Kysely migration runner.
 *
 * Thin wrapper over Kysely's `Migrator` that runs a `MigrationProvider` to the
 * latest migration and throws (surfacing the underlying error, named by the
 * migration that failed) if any step fails. The caller supplies the provider —
 * typically the generated `migrationProvider` that `generate.ts` writes into an
 * app's `migrations/index.ts`, optionally merged with plugin-owned providers by
 * `mergeMigrationProviders`.
 */

/**
 * Runs `provider` to the latest migration.
 *
 * `allowUnorderedMigrations` is opt-in because it is only correct for a chain
 * that merges plugin-owned migrations into the app's own (see
 * `mergeMigrationProviders`). Plugin migrations are merged at apply time, so
 * installing a new plugin can introduce a migration whose name sorts BEFORE
 * migrations already recorded in `kysely_migration` — Kysely rejects that by
 * default. An app-only chain should leave the option off so that genuinely
 * out-of-order history stays an error.
 */
export async function migrateToLatest<T>(
    db: Kysely<T>,
    provider: MigrationProvider,
    options?: { allowUnorderedMigrations?: boolean }
): Promise<void> {
    const migrator = new Migrator({
        db,
        provider,
        allowUnorderedMigrations: options?.allowUnorderedMigrations ?? false,
    });
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

/**
 * Merges plugin-owned migration providers into the app's own, producing one
 * provider for one `kysely_migration` table.
 *
 * Plugin migrations are keyed `plugin_<alias>_<name>` so that two plugins (or a
 * plugin and the app) can each own a `0000_init` without colliding. The prefix
 * exists ONLY here, at apply time: migration FILES and `journal.json` entries
 * keep their bare `NNNN_<tag>` names, so a plugin's own `migrations/` directory
 * is unaware of the alias it is installed under.
 *
 * Because every migration shares one `kysely_migration` table, the merged chain
 * is not globally sortable — apply it with
 * `migrateToLatest(db, merged, { allowUnorderedMigrations: true })`.
 */
export function mergeMigrationProviders(
    app: MigrationProvider,
    plugins: { alias: string; provider: MigrationProvider }[]
): MigrationProvider {
    return {
        async getMigrations() {
            const merged: Record<string, Migration> = {};
            const owners = new Map<string, string>();

            for (const [name, migration] of Object.entries(await app.getMigrations())) {
                merged[name] = migration;
                owners.set(name, 'the app');
            }

            for (const { alias, provider } of plugins) {
                for (const [name, migration] of Object.entries(
                    await provider.getMigrations()
                )) {
                    const key = `plugin_${alias}_${name}`;
                    const owner = owners.get(key);
                    if (owner !== undefined) {
                        throw new Error(
                            `duplicate migration "${key}": plugin "${alias}" collides with ${owner}`
                        );
                    }
                    merged[key] = migration;
                    owners.set(key, `plugin "${alias}"`);
                }
            }

            return merged;
        },
    };
}
