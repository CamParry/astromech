/**
 * Public Drizzle surface for plugin schema authoring (`astromech/db`,
 * spec §8/§9). SQLite-only for v1; tables must use the `plugin_{alias}_`
 * prefix (enforced at config resolution) and no cross-plugin FKs.
 */

export {
    sqliteTable,
    text,
    integer,
    real,
    blob,
    numeric,
    primaryKey,
    foreignKey,
    index,
    uniqueIndex,
    check,
} from 'drizzle-orm/sqlite-core';

export { sql, relations, eq, and, or, not, desc, asc, inArray, like } from 'drizzle-orm';
