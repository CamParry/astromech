import type { Kysely, Migration, MigrationProvider } from 'kysely';
import { Migrator } from 'kysely';

/**
 * Kysely migration runner — a thin wrapper over `Migrator` that runs a
 * `MigrationProvider` to the latest migration and throws, naming the migration
 * that failed. The caller typically supplies `generate.ts`'s generated provider.
 */

/**
 * Runs `provider` to the latest migration. `allowUnorderedMigrations` is
 * opt-in: it is only correct for a chain that merges plugin-owned migrations
 * into the app's own, via {@link mergeMigrationProviders}.
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
 * provider for one `kysely_migration` table. Plugin migrations are keyed
 * `plugin_<alias>_<name>` so a plugin and the app can each own a `0000_init`.
 * Apply the result with `allowUnorderedMigrations: true`.
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
