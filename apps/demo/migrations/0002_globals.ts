import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
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
}
