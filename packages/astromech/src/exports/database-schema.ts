/**
 * `astromech/database/schema` — the schema surface used for migrations and seeding.
 *
 * Exposes the tables / row types plus the seed-facing helpers (the row codec
 * and the `DB` type), so seed scripts insert in the correct storage format
 * without reaching into raw `src/database` internals. This module is a leaf
 * re-export (nothing in the codec/schema graph imports it), so adding the codec
 * re-exports here introduces no import cycle.
 *
 * A driver is not among them: every driver has its own subpath
 * (`astromech/database/libsql`, `astromech/database/d1`) so that importing the
 * schema never drags a driver's client library into the bundle.
 *
 * Both codec halves are re-exported because a seed touches both kinds of table:
 * `encodeWith`/`decodeWith` take a `Table` and give ISO-TEXT timestamps (our
 * tables — the ones above), while `encode`/`decode` take a table-name
 * string and are the only way to reach the seconds-INTEGER format better-auth
 * owns (`users`, `accounts`, …), which has no `Table` to pass.
 */

export * from '@/database/schema';
export { encode, decode, encodeWith, decodeWith } from '@/database/codec';
export type { DB, Db } from '@/database/types';
