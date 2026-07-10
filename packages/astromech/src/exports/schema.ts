/**
 * `astromech/db/schema` — the schema surface used for migrations and seeding.
 *
 * Exposes the table descriptors / row types plus the seed-facing helpers
 * (`libsqlDriver` for a `Kysely<DB>` handle, `encode`/`decode` for the row
 * codec, and the `DB` type), so seed scripts insert in the correct storage
 * format (ISO-TEXT timestamps for our tables, seconds-INTEGER for auth) without
 * reaching into raw `src/database` internals. This module is a leaf re-export
 * (nothing in the codec/schema graph imports it), so adding the codec/driver
 * re-exports here introduces no import cycle.
 */

export * from '@/database/schema.js';
export { encode, decode } from '@/database/codec.js';
export { libsqlDriver } from '@/database/drivers/libsql.js';
export type { DB, Db } from '@/database/types.js';
