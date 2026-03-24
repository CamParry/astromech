/**
 * Database Registry
 *
 * Stores the active database instance, set once at startup by the
 * Astromech integration. Mirrors the storage registry pattern.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = LibSQLDatabase<any>;

declare global {
    // eslint-disable-next-line no-var
    var __astromechDb: AnyDb | undefined;
}

export function setDb(db: AnyDb): void {
    globalThis.__astromechDb = db;
}

export function getDb(): AnyDb {
    if (!globalThis.__astromechDb) {
        throw new Error(
            '[Astromech] Database not initialized. ' +
                'Ensure the Astromech integration is configured with a db driver.'
        );
    }
    return globalThis.__astromechDb;
}
