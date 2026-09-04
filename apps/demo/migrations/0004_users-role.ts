import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Renames `users.role_slug` to `users.role`. Generated from
 * `ops/0004-users-role.ts` and then hand-edited: the differ has no rename op,
 * so it emitted the SQLite table rebuild, and that rebuild's `DROP TABLE users`
 * would fire the `ON DELETE set null` cascades on every author column in the
 * schema, blanking `created_by` and `updated_by` across the database. SQLite
 * has supported `ALTER TABLE ... RENAME COLUMN` since 3.25, and it leaves the
 * referencing tables alone.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE \`users\` RENAME COLUMN \`role_slug\` TO \`role\``.execute(db);
}
