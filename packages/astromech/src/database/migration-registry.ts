/**
 * The migration chain this site runs: the app's own merged with each plugin's.
 * Boot registers it, and a restore reads it to bring a backup up to this schema.
 */

import type { MigrationProvider } from 'kysely/migration';
import { createRegistry } from '@/registry';

const migrationProvider = createRegistry<MigrationProvider>('migrationProvider', {
    hint: 'Boot registers it from the config, and the test harness from its own chain.',
});

export const setMigrationProvider = migrationProvider.set;

/** The registered migration chain. Throws when unset. */
export const getMigrationProvider = migrationProvider.getOrThrow;

const bundledMigrationNames = createRegistry<readonly string[]>('bundledMigrationNames', {
    required: false,
});

/**
 * Register the app's migration names the build bundled, for a runtime that
 * cannot read the migrations folder. The Astro middleware sets it before boot.
 */
export const setBundledMigrationNames = bundledMigrationNames.set;

/** The bundled app migration names, or undefined when none were registered. */
export function resolveBundledMigrationNames(): readonly string[] | undefined {
    return bundledMigrationNames.get() ?? undefined;
}
