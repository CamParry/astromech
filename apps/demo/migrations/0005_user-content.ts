import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Moves `users.fields` out to the per-locale `user_content`, and adds
 * `user_versions`. Generated from `ops/0005-user-content.ts` and then
 * hand-edited: the differ emitted the SQLite table rebuild for `users`, and
 * that rebuild's `DROP TABLE users` would fire the `ON DELETE set null`
 * cascades on every author column in the schema, blanking `created_by` and
 * `updated_by` across the database. SQLite has supported
 * `ALTER TABLE ... DROP COLUMN` since 3.35, `fields` is in no index or
 * constraint, and the drop leaves the referencing tables alone.
 *
 * Each existing user's `fields` becomes one `user_content` row in the demo's
 * default content locale, `en`. The content row keeps the user id as its own:
 * ids only have to be unique within `user_content`, there is exactly one row
 * per user here, and reusing the id keeps the two aligned without minting one
 * in SQL. The `settings` rebuild is kept as emitted — its `updated_by`
 * foreign key gains `ON DELETE set null` and nothing references `settings`.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`user_content\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`user_id\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`user_content_user_id_fkey\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`user_content_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`user_content_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_user_content_user\` ON \`user_content\` (\`user_id\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`user_content_user_locale_unique\` ON \`user_content\` (\`user_id\`,\`locale\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`user_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`user_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`user_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`user_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_user_versions_content\` ON \`user_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );
    await sql`
        INSERT INTO \`user_content\` (
            \`id\`, \`user_id\`, \`locale\`, \`fields\`,
            \`created_at\`, \`updated_at\`, \`created_by\`, \`updated_by\`
        )
        SELECT id, id, 'en', fields, created_at, updated_at, NULL, NULL
        FROM users
    `.execute(db);
    await sql`ALTER TABLE \`users\` DROP COLUMN \`fields\``.execute(db);
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);
    await sql`
        CREATE TABLE \`__new_settings\` (
            \`key\` text PRIMARY KEY NOT NULL,
            \`value\` text,
            \`updated_at\` text NOT NULL,
            \`updated_by\` text,
            CONSTRAINT \`settings_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`INSERT INTO \`__new_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) SELECT \`key\`, \`value\`, \`updated_at\`, \`updated_by\` FROM \`settings\``.execute(
        db
    );
    await sql`DROP TABLE \`settings\``.execute(db);
    await sql`ALTER TABLE \`__new_settings\` RENAME TO \`settings\``.execute(db);
}
