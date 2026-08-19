/**
 * Database Registry
 *
 * Stores the active database instance, set once at startup by the
 * Astromech integration. Mirrors the storage registry pattern.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createRegistry } from '@/utilities/registry';

type AnyDb = Kysely<DB>;

const db = createRegistry<AnyDb>('db', {
    hint: 'Ensure the Astromech integration is configured with a db driver.',
});

export const setDb = db.set;
export const getDb = db.get;
