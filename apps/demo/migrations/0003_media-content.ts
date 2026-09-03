import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Splits `media` into the resource row `media` and the per-locale
 * `media_content`, and adds `media_versions`. Hand-authored from
 * `ops/0003-media-content.ts`: the differ refuses a `media` rebuild while
 * `media_content` cascades off it, and the diff cannot carry the four moved
 * columns across.
 *
 * `media` is rebuilt first (renamed aside, so the two new tables reference the
 * new one), then each old row becomes one `media_content` row in the demo's
 * default content locale, `en`. The content row keeps the media id as its own:
 * ids only have to be unique within `media_content`, there is exactly one row
 * per media item here, and reusing the ULID keeps the id sortable by age
 * without minting one in SQL. `updated_by` on the resource row starts as
 * `created_by`: nobody has replaced the file yet.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);

    await sql`DROP INDEX \`idx_media_mime\``.execute(db);
    await sql`DROP INDEX \`idx_media_created\``.execute(db);
    await sql`ALTER TABLE \`media\` RENAME TO \`media_old\``.execute(db);
    await sql`
        CREATE TABLE \`media\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`filename\` text NOT NULL,
            \`mime_type\` text NOT NULL,
            \`size\` integer NOT NULL,
            \`width\` integer,
            \`height\` integer,
            \`metadata\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`media_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`media_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_media_mime\` ON \`media\` (\`mime_type\`)`.execute(db);
    await sql`CREATE INDEX \`idx_media_created\` ON \`media\` (\`created_at\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`media_content\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`media_id\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`title\` text,
            \`alt\` text,
            \`caption\` text,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`media_content_media_id_fkey\` FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`media_content_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`media_content_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_media_content_media\` ON \`media_content\` (\`media_id\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`media_content_media_locale_unique\` ON \`media_content\` (\`media_id\`,\`locale\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`media_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`title\` text,
            \`alt\` text,
            \`caption\` text,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`media_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`media_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`media_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_media_versions_content\` ON \`media_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );

    await sql`
        INSERT INTO \`media\` (
            \`id\`, \`filename\`, \`mime_type\`, \`size\`, \`width\`, \`height\`,
            \`metadata\`, \`created_at\`, \`updated_at\`, \`created_by\`, \`updated_by\`
        )
        SELECT id, filename, mime_type, size, width, height,
            metadata, created_at, updated_at, created_by, created_by
        FROM media_old
    `.execute(db);

    await sql`
        INSERT INTO \`media_content\` (
            \`id\`, \`media_id\`, \`locale\`, \`title\`, \`alt\`, \`caption\`, \`fields\`,
            \`created_at\`, \`updated_at\`, \`created_by\`, \`updated_by\`
        )
        SELECT id, id, 'en', title, alt, caption, fields,
            created_at, updated_at, created_by, created_by
        FROM media_old
    `.execute(db);

    await sql`DROP TABLE \`media_old\``.execute(db);
}
