import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Splits `entries` into the resource row `entries` and the per-locale
 * `entry_content`, re-keys `entry_versions` on the content row, and drops
 * `entry_preview_tokens`. Hand-authored: the diff cannot backfill a NOT NULL
 * `content_id`, and the rebuild would cascade `entry_content` away.
 *
 * Each old row keeps its id as its content row's id, so `staged_for` and
 * `entry_versions.entry_id` carry over verbatim. The entry id is the oldest
 * canonical row in the `locale_group`, which is also the id the relationships
 * index is remapped onto.
 */

/** The group's entry id, for a row aliased `r` with its canonical aliased `c`. */
const ENTRY_ID = sql`(
    SELECT e2.id FROM entries_old e2
    WHERE e2.locale_group = COALESCE(c.locale_group, r.locale_group)
      AND e2.staged_for IS NULL
    ORDER BY e2.created_at ASC, e2.id ASC
    LIMIT 1
)`;

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);

    // A one-to-one satellite whose own created columns nothing reads; the token
    // is two columns on `entries` now.
    await sql`DROP TABLE \`entry_preview_tokens\``.execute(db);

    // Renamed before `entries`, so its foreign key follows that table's rename.
    await sql`DROP INDEX \`idx_versions_entry\``.execute(db);
    await sql`ALTER TABLE \`entry_versions\` RENAME TO \`entry_versions_old\``.execute(
        db
    );

    for (const name of [
        'idx_entries_type',
        'idx_entries_status',
        'idx_entries_locale',
        'idx_entries_deleted',
        'idx_entries_locale_group',
        'idx_entries_staged_for',
        'entries_locale_group_locale_unique',
        'entries_type_locale_slug_unique',
    ]) {
        await sql`DROP INDEX ${sql.ref(name)}`.execute(db);
    }
    await sql`ALTER TABLE \`entries\` RENAME TO \`entries_old\``.execute(db);

    await sql`
        CREATE TABLE \`entries\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`type\` text NOT NULL,
            \`preview_token\` text,
            \`preview_token_expires_at\` text,
            \`deleted_at\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`entries_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`entries_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_entries_type\` ON \`entries\` (\`type\`)`.execute(db);
    await sql`CREATE INDEX \`idx_entries_deleted\` ON \`entries\` (\`deleted_at\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`entries_preview_token_unique\` ON \`entries\` (\`preview_token\`)`.execute(
        db
    );

    await sql`
        CREATE TABLE \`entry_content\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`entry_id\` text NOT NULL,
            \`type\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`status\` text DEFAULT 'unpublished' NOT NULL CHECK (\`status\` IN ('unpublished', 'published', 'scheduled')),
            \`published_at\` text,
            \`staged_for\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`entry_content_entry_id_fkey\` FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`entry_content_staged_for_fkey\` FOREIGN KEY (\`staged_for\`) REFERENCES \`entry_content\`(\`id\`) ON UPDATE no action ON DELETE no action,
            CONSTRAINT \`entry_content_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`entry_content_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_entry_content_entry\` ON \`entry_content\` (\`entry_id\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entry_content_locale\` ON \`entry_content\` (\`type\`,\`locale\`,\`status\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entry_content_staged_for\` ON \`entry_content\` (\`staged_for\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`entry_content_entry_locale_unique\` ON \`entry_content\` (\`entry_id\`,\`locale\`) WHERE staged_for IS NULL`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`entry_content_type_locale_slug_unique\` ON \`entry_content\` (\`type\`,\`locale\`,\`slug\`) WHERE staged_for IS NULL`.execute(
        db
    );

    await sql`
        CREATE TABLE \`entry_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`status\` text CHECK (\`status\` IN ('unpublished', 'published', 'scheduled')),
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`entry_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`entry_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`entry_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_entry_versions_content\` ON \`entry_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );

    // One entry per locale group, taking the oldest canonical row. The entry is
    // trashed only when every locale of it was.
    await sql`
        INSERT INTO \`entries\` (
            \`id\`, \`type\`, \`deleted_at\`, \`created_at\`, \`updated_at\`,
            \`created_by\`, \`updated_by\`
        )
        SELECT r.id, r.type,
            CASE WHEN NOT EXISTS (
                SELECT 1 FROM entries_old x
                WHERE x.locale_group = r.locale_group
                  AND x.staged_for IS NULL
                  AND x.deleted_at IS NULL
            ) THEN r.deleted_at ELSE NULL END,
            r.created_at, r.updated_at, r.created_by, r.updated_by
        FROM entries_old r
        LEFT JOIN entries_old c ON c.id = r.staged_for
        WHERE r.staged_for IS NULL AND r.id = ${ENTRY_ID}
    `.execute(db);

    // Every old row becomes a content row, keeping its id. A staged row joins
    // its canonical's entry rather than the fresh locale group it was given.
    await sql`
        INSERT INTO \`entry_content\` (
            \`id\`, \`entry_id\`, \`type\`, \`locale\`, \`title\`, \`slug\`, \`fields\`,
            \`status\`, \`published_at\`, \`staged_for\`, \`created_at\`, \`updated_at\`,
            \`created_by\`, \`updated_by\`
        )
        SELECT r.id, ${ENTRY_ID}, r.type, r.locale, r.title, r.slug, r.fields,
            r.status, r.published_at, r.staged_for, r.created_at, r.updated_at,
            r.created_by, r.updated_by
        FROM entries_old r
        LEFT JOIN entries_old c ON c.id = r.staged_for
    `.execute(db);

    await sql`
        INSERT INTO \`entry_versions\` (
            \`id\`, \`content_id\`, \`version\`, \`title\`, \`slug\`, \`fields\`,
            \`status\`, \`created_at\`, \`created_by\`
        )
        SELECT id, entry_id, version_number, title, slug, fields, status,
            created_at, created_by
        FROM entry_versions_old
    `.execute(db);

    // The index is derived, so this only re-points what a rebuild would rewrite
    // anyway. `OR REPLACE` because two locales of one entry can collapse onto
    // one edge, which the composite primary key would otherwise reject.
    await sql`
        UPDATE OR REPLACE \`relationships\`
        SET \`target_id\` = COALESCE((
            SELECT ${ENTRY_ID} FROM entries_old r
            LEFT JOIN entries_old c ON c.id = r.staged_for
            WHERE r.id = relationships.target_id
        ), \`target_id\`)
        WHERE \`target_kind\` = 'entry'
    `.execute(db);

    await sql`DROP TABLE \`entry_versions_old\``.execute(db);
    await sql`DROP TABLE \`entries_old\``.execute(db);
}
