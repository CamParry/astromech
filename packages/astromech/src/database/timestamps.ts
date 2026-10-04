/**
 * Timestamp comparisons in SQL by the time a stored ISO string names, not by its
 * spelling: `julianday` reads an offset or a missing fraction as the same time.
 */

import type { RawBuilder, SqlBool } from 'kysely';
import { sql } from 'kysely';

/**
 * `column <op> value`, both read as times. `column` is a Kysely reference
 * (`globalContent.publishedAt`); a null column compares false.
 */
export function compareTimestamps(
    column: string,
    op: '=' | '<=',
    value: Date
): RawBuilder<SqlBool> {
    return sql<SqlBool>`julianday(${sql.ref(column)}) ${sql.raw(op)} julianday(${value.toISOString()})`;
}
