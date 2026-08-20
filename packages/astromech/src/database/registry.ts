/**
 * Database registry — stores the active database instance, set once at
 * startup by the Astromech integration. Mirrors the storage registry pattern.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { getTransactionScope } from '@/database/transaction';
import { createRegistry } from '@/registry';

type AnyDb = Kysely<DB>;

const db = createRegistry<AnyDb>('db', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDb = db.set;

/** The open transaction handle when `transaction()` has one scoped, else the active database instance. Throws when unset. */
export function getDb(): AnyDb {
    return getTransactionScope() ?? db.getOrThrow();
}
