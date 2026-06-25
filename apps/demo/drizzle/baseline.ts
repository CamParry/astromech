/**
 * Hand-authored Kysely baseline migration.
 *
 * Squashes the 15 historical drizzle-kit migrations into ONE baseline that
 * reproduces today's schema exactly: snake_case DDL, INTEGER unix-seconds
 * timestamps, TEXT json, INTEGER 0/1 booleans, identical SQL DEFAULTs, indexes
 * and foreign keys. Derived by replaying every `drizzle/*.sql` migration into a
 * fresh SQLite db and dumping `sqlite_master`.
 *
 * Raw `sql` is used for every statement so the active `CamelCasePlugin` never
 * rewrites identifiers. Static provider object (not `FileMigrationProvider`) so
 * it is Workers-safe. Step 4 replaces this with the homegrown generator.
 */

import { sql, type Kysely, type MigrationProvider } from 'kysely';

async function up(db: Kysely<unknown>): Promise<void> {
    // ── roles ──────────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`roles\` (
            \`slug\` text PRIMARY KEY NOT NULL,
            \`name\` text NOT NULL,
            \`permissions\` text NOT NULL,
            \`is_built_in\` integer DEFAULT 0 NOT NULL,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL
        )
    `.execute(db);

    // ── users ──────────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`users\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`email\` text NOT NULL,
            \`name\` text NOT NULL,
            \`email_verified\` integer DEFAULT 0 NOT NULL,
            \`image\` text,
            \`fields\` text,
            \`role_slug\` text DEFAULT 'admin' NOT NULL,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`users_email_unique\` ON \`users\` (\`email\`)`.execute(
        db
    );

    // ── sessions ───────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`sessions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`expires_at\` integer NOT NULL,
            \`token\` text NOT NULL,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL,
            \`ip_address\` text,
            \`user_agent\` text,
            \`user_id\` text NOT NULL,
            FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`sessions_token_unique\` ON \`sessions\` (\`token\`)`.execute(
        db
    );

    // ── accounts ───────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`accounts\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`account_id\` text NOT NULL,
            \`provider_id\` text NOT NULL,
            \`user_id\` text NOT NULL,
            \`access_token\` text,
            \`refresh_token\` text,
            \`id_token\` text,
            \`access_token_expires_at\` integer,
            \`refresh_token_expires_at\` integer,
            \`scope\` text,
            \`password\` text,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL,
            FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
        )
    `.execute(db);

    // ── verifications ──────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`verifications\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`identifier\` text NOT NULL,
            \`value\` text NOT NULL,
            \`expires_at\` integer NOT NULL,
            \`created_at\` integer,
            \`updated_at\` integer
        )
    `.execute(db);

    // ── entries ────────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`entries\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`type\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`locale_group\` text NOT NULL,
            \`slug\` text,
            \`title\` text NOT NULL,
            \`fields\` text,
            \`status\` text DEFAULT 'unpublished' NOT NULL,
            \`published_at\` integer,
            \`deleted_at\` integer,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            \`staged_for\` text REFERENCES entries(id),
            FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action,
            FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_entries_type\` ON \`entries\` (\`type\`)`.execute(db);
    await sql`CREATE INDEX \`idx_entries_status\` ON \`entries\` (\`type\`,\`status\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entries_locale\` ON \`entries\` (\`type\`,\`locale\`,\`status\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entries_deleted\` ON \`entries\` (\`deleted_at\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entries_locale_group\` ON \`entries\` (\`locale_group\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entries_staged_for\` ON \`entries\` (\`staged_for\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`entries_locale_group_locale_unique\` ON \`entries\` (\`locale_group\`,\`locale\`)`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX \`entries_type_locale_slug_unique\` ON \`entries\` (\`type\`,\`locale\`,\`slug\`) WHERE "entries"."staged_for" is null`.execute(
        db
    );

    // ── entry_versions ─────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`entry_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`entry_id\` text NOT NULL,
            \`version_number\` integer NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`relations\` text,
            \`status\` text,
            \`created_at\` integer NOT NULL,
            \`created_by\` text,
            FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_versions_entry\` ON \`entry_versions\` (\`entry_id\`,\`version_number\`)`.execute(
        db
    );

    // ── entry_preview_tokens ───────────────────────────────────────────────
    await sql`
        CREATE TABLE \`entry_preview_tokens\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`entry_id\` text NOT NULL,
            \`token\` text NOT NULL,
            \`expires_at\` integer,
            \`created_at\` integer NOT NULL,
            \`created_by\` text,
            FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`entry_preview_tokens_token_unique\` ON \`entry_preview_tokens\` (\`token\`)`.execute(
        db
    );

    // ── media ──────────────────────────────────────────────────────────────
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
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL,
            \`created_by\` text,
            FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_media_mime\` ON \`media\` (\`mime_type\`)`.execute(db);
    await sql`CREATE INDEX \`idx_media_created\` ON \`media\` (\`created_at\`)`.execute(
        db
    );

    // ── settings ───────────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`settings\` (
            \`key\` text PRIMARY KEY NOT NULL,
            \`value\` text,
            \`updated_at\` integer NOT NULL,
            \`updated_by\` text,
            FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);

    // ── notifications ──────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`notifications\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`user_id\` text NOT NULL,
            \`type\` text NOT NULL,
            \`title\` text NOT NULL,
            \`message\` text NOT NULL,
            \`href\` text,
            \`created_at\` integer NOT NULL,
            FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
        )
    `.execute(db);
    await sql`CREATE INDEX \`notifications_user_created_idx\` ON \`notifications\` (\`user_id\`,\`created_at\`)`.execute(
        db
    );

    // ── relationships ──────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`relationships\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`source_id\` text NOT NULL,
            \`source_type\` text NOT NULL,
            \`name\` text NOT NULL,
            \`target_id\` text NOT NULL,
            \`target_type\` text NOT NULL,
            \`position\` integer DEFAULT 0 NOT NULL,
            \`created_at\` integer NOT NULL
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_rel_source\` ON \`relationships\` (\`source_id\`,\`source_type\`,\`name\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_target\` ON \`relationships\` (\`target_id\`,\`target_type\`)`.execute(
        db
    );

    // ── _astromech_cron ────────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`_astromech_cron\` (
            \`name\` text PRIMARY KEY NOT NULL,
            \`schedule\` text NOT NULL,
            \`enabled\` integer DEFAULT 1 NOT NULL,
            \`last_run\` integer,
            \`next_run\` integer,
            \`lock\` integer
        )
    `.execute(db);

    // ── plugin_redirects_redirects ─────────────────────────────────────────
    await sql`
        CREATE TABLE \`plugin_redirects_redirects\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`from\` text NOT NULL,
            \`to\` text NOT NULL,
            \`status\` text DEFAULT '301' NOT NULL,
            \`enabled\` integer DEFAULT 1 NOT NULL,
            \`created_at\` integer NOT NULL,
            \`updated_at\` integer NOT NULL
        )
    `.execute(db);

    // ── plugin_backups_runs ────────────────────────────────────────────────
    await sql`
        CREATE TABLE \`plugin_backups_runs\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`key\` text,
            \`status\` text NOT NULL,
            \`trigger\` text NOT NULL,
            \`size_bytes\` integer,
            \`error\` text,
            \`started_at\` integer NOT NULL,
            \`finished_at\` integer,
            \`artifact_deleted_at\` integer
        )
    `.execute(db);
}

export const baselineProvider: MigrationProvider = {
    async getMigrations() {
        return { '0000_baseline': { up } };
    },
};
