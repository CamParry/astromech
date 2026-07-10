/**
 * Database Registry
 *
 * Stores the active database instance, set once at startup by the
 * Astromech integration. Mirrors the storage registry pattern.
 */

import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import type { DB } from '@/database/types.js';

type AnyDb = Kysely<DB>;

declare global {
    var __astromechDb: AnyDb | undefined;
    var __astromechDbClient: Client | undefined;
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

/**
 * Shared libsql `Client` registry. better-auth's Kysely adapter and the
 * dump/restore paths run against this raw client (a Kysely-free escape hatch)
 * so the `CamelCasePlugin` on the main instance never double-transforms
 * better-auth's own snake_case field maps.
 */
export function setDbClient(c: Client): void {
    globalThis.__astromechDbClient = c;
}

export function getDbClient(): Client {
    if (!globalThis.__astromechDbClient) {
        throw new Error('[Astromech] DB client not initialized');
    }
    return globalThis.__astromechDbClient;
}
