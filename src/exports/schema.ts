/**
 * `astromech/db/schema` — the drizzle schema surface used for migrations.
 *
 * Also the schema source consumed by `drizzle.config.ts` / `demo/drizzle.config.ts`,
 * so consumers (and drizzle-kit) never reach into raw `src/db` internals.
 */

export * from '@/database/schema.js';
