/**
 * Database Registry
 *
 * Stores the active database instance, set once at startup by the
 * Astromech integration. Mirrors the storage registry pattern.
 */

import { defineRegistry } from '@/utilities/registry.js';
import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import type { DB } from '@/database/types.js';

type AnyDb = Kysely<DB>;

const db = defineRegistry<AnyDb>('db', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDb = db.set;
export const getDb = db.get;

/**
 * Shared libsql `Client` registry. better-auth's Kysely adapter and the
 * dump/restore paths run against this raw client (a Kysely-free escape hatch)
 * so the `CamelCasePlugin` on the main instance never double-transforms
 * better-auth's own snake_case field maps.
 */
const dbClient = defineRegistry<Client>('dbClient', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDbClient = dbClient.set;
export const getDbClient = dbClient.get;
