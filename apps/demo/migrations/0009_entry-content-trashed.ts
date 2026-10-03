import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Adds `entry_content.trashed`, a copy of `entries.deleted_at` the slug-unique
 * index can read, so a trashed entry's slug is free. Generated, then the
 * backfill hand-added: content rows of an entry already in the trash are marked.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX \`entry_content_type_locale_slug_unique\``.execute(db);
    await sql`ALTER TABLE \`entry_content\` ADD COLUMN \`trashed\` integer DEFAULT 0 NOT NULL`.execute(
        db
    );
    await sql`
        UPDATE \`entry_content\` SET \`trashed\` = 1
        WHERE \`entry_id\` IN (SELECT \`id\` FROM \`entries\` WHERE \`deleted_at\` IS NOT NULL)
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`entry_content_type_locale_slug_unique\` ON \`entry_content\` (\`type\`,\`locale\`,\`slug\`) WHERE staged_for IS NULL AND trashed = 0`.execute(
        db
    );
}
