/**
 * Database Driver Registry
 *
 * Retains the full driver object (including optional dump/restore) so
 * plugins can feature-detect capabilities at runtime. Mirrors the storage
 * registry pattern.
 */

import type { DatabaseDriver } from '@/types/index';
import { createRegistry } from '@/registry';

const dbDriver = createRegistry<DatabaseDriver>('dbDriver', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDatabaseDriver = dbDriver.set;

/** Feature-detect the driver without requiring one — null when unwired. */
export const getDatabaseDriver = dbDriver.get;

/** The configured database driver. Throws when unset. */
export const getDatabaseDriverOrThrow = dbDriver.getOrThrow;
