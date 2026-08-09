/**
 * Database Driver Registry
 *
 * Retains the full driver object (including optional dump/restore) so
 * plugins can feature-detect capabilities at runtime. Mirrors the storage
 * registry pattern.
 */

import { createRegistry } from '@/utilities/registry';
import type { DatabaseDriver } from '@/types/index';

const dbDriver = createRegistry<DatabaseDriver>('dbDriver', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDatabaseDriver = dbDriver.set;
export const getDatabaseDriver = dbDriver.get;

/** Feature-detect the driver without requiring one — null when unwired. */
export const peekDatabaseDriver = dbDriver.peek;
