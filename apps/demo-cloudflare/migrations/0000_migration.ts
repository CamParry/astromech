import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`_astromech_cron\` (
            \`name\` text PRIMARY KEY NOT NULL,
            \`schedule\` text NOT NULL,
            \`enabled\` integer DEFAULT 1 NOT NULL,
            \`last_run\` text,
            \`next_run\` text,
            \`lock\` text
        )
    `.execute(db);
    await sql`
        CREATE TABLE \`_astromech_plugins\` (
            \`package\` text PRIMARY KEY NOT NULL,
            \`namespace\` text NOT NULL,
            \`version\` text NOT NULL,
            \`installed_at\` text NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`_astromech_plugins_namespace_unique\` ON \`_astromech_plugins\` (\`namespace\`)`.execute(
        db
    );
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
    await sql`
        CREATE TABLE \`globals\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`key\` text NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`globals_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`globals_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`globals_key_unique\` ON \`globals\` (\`key\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`global_content\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`global_id\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`fields\` text,
            \`status\` text DEFAULT 'unpublished' NOT NULL CHECK (\`status\` IN ('unpublished', 'published', 'scheduled')),
            \`published_at\` text,
            \`staged_for\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            CONSTRAINT \`global_content_global_id_fkey\` FOREIGN KEY (\`global_id\`) REFERENCES \`globals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`global_content_staged_for_fkey\` FOREIGN KEY (\`staged_for\`) REFERENCES \`global_content\`(\`id\`) ON UPDATE no action ON DELETE no action,
            CONSTRAINT \`global_content_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`global_content_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_global_content_global\` ON \`global_content\` (\`global_id\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_global_content_staged_for\` ON \`global_content\` (\`staged_for\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`global_content_global_locale_unique\` ON \`global_content\` (\`global_id\`,\`locale\`) WHERE staged_for IS NULL`.execute(
        db
    );
    await sql`
        CREATE TABLE \`global_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`fields\` text,
            \`status\` text CHECK (\`status\` IN ('unpublished', 'published', 'scheduled')),
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`global_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`global_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`global_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_global_versions_content\` ON \`global_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`media\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`filename\` text NOT NULL,
            \`mime_type\` text NOT NULL,
            \`size\` integer NOT NULL,
            \`width\` integer,
            \`height\` integer,
            \`alt\` text,
            \`fields\` text,
            \`metadata\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`title\` text,
            \`caption\` text,
            CONSTRAINT \`media_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_media_mime\` ON \`media\` (\`mime_type\`)`.execute(db);
    await sql`CREATE INDEX \`idx_media_created\` ON \`media\` (\`created_at\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`notifications\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`user_id\` text NOT NULL,
            \`type\` text NOT NULL,
            \`title\` text NOT NULL,
            \`message\` text NOT NULL,
            \`href\` text,
            \`created_at\` text NOT NULL,
            CONSTRAINT \`notifications_user_id_fkey\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
        )
    `.execute(db);
    await sql`CREATE INDEX \`notifications_user_created_idx\` ON \`notifications\` (\`user_id\`,\`created_at\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`relationships\` (
            \`source_id\` text NOT NULL,
            \`source_kind\` text NOT NULL CHECK (\`source_kind\` IN ('entry', 'user', 'media')),
            \`source_type\` text,
            \`schema_path\` text NOT NULL,
            \`instance_path\` text NOT NULL,
            \`target_id\` text NOT NULL,
            \`target_kind\` text NOT NULL CHECK (\`target_kind\` IN ('entry', 'user', 'media')),
            \`source_staged\` integer DEFAULT 0 NOT NULL,
            PRIMARY KEY (\`source_id\`, \`source_kind\`, \`instance_path\`, \`target_id\`, \`target_kind\`)
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_rel_target\` ON \`relationships\` (\`target_id\`,\`target_kind\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_filter\` ON \`relationships\` (\`source_type\`,\`schema_path\`,\`target_id\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`roles\` (
            \`slug\` text PRIMARY KEY NOT NULL,
            \`name\` text NOT NULL,
            \`permissions\` text NOT NULL,
            \`is_built_in\` integer DEFAULT 0 NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL
        )
    `.execute(db);
    await sql`
        CREATE TABLE \`settings\` (
            \`key\` text PRIMARY KEY NOT NULL,
            \`value\` text,
            \`updated_at\` text NOT NULL,
            \`updated_by\` text,
            CONSTRAINT \`settings_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`
        CREATE TABLE \`users\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`email\` text NOT NULL,
            \`name\` text NOT NULL,
            \`email_verified\` integer DEFAULT 0 NOT NULL,
            \`image\` text,
            \`fields\` text,
            \`role_slug\` text NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`users_email_unique\` ON \`users\` (\`email\`)`.execute(
        db
    );
}
