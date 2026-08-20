/**
 * `astromech/database/schema` — the schema surface for migrations and
 * seeding: tables, row types, and the seed-facing codec. A driver is not
 * among them — each has its own subpath.
 */

export * from '@/database/tables';
export { encode, decode, encodeWith, decodeWith } from '@/database/codec';
export type { DB, Db } from '@/database/types';
