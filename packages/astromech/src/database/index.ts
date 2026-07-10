/**
 * Database exports
 */

export * from '@/database/schema.js';
export { getDb, setDb, getDbClient, setDbClient } from '@/database/registry.js';
export type { DB, Db } from '@/database/types.js';
