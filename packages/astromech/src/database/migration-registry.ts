/**
 * The migration chain this site runs: the app's own merged with each plugin's.
 * Boot registers it, and a restore reads it to bring a backup up to this schema.
 * Also the app migration names the build bundled.
 */

import type { MigrationProvider } from 'kysely/migration';
import { createRegistry } from '@/registry';

const migrationProvider = createRegistry<MigrationProvider>('migrationProvider', {
    hint: 'Boot registers it from the config, and the test harness from its own chain.',
});

export const setMigrationProvider = migrationProvider.set;

/** The registered migration chain. Throws when unset. */
export const getMigrationProvider = migrationProvider.getOrThrow;

/**
 * The app's migration names, which the Astro integration's Vite config defines
 * at build time. Undefined where nothing defined it, as in the CLI.
 */
declare const __ASTROMECH_MIGRATION_NAMES__: readonly string[] | null;

/**
 * The app migration names the build bundled, for a runtime that cannot read
 * the migrations folder; undefined when the build bundled none. A build-time
 * constant rather than a registry, so boot reads it whichever event woke the
 * runtime: a Worker's first event can be a Cron Trigger, which runs no
 * middleware.
 */
export function resolveBundledMigrationNames(): readonly string[] | undefined {
    if (typeof __ASTROMECH_MIGRATION_NAMES__ === 'undefined') return undefined;
    return __ASTROMECH_MIGRATION_NAMES__ ?? undefined;
}
