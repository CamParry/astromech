import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * `entry_drafts` and `global_drafts`: the pending changes to a published
 * locale, one row per entry (or global) and locale.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`entry_drafts\` (
            \`entry_id\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            PRIMARY KEY (\`entry_id\`, \`locale\`),
            CONSTRAINT \`entry_drafts_entry_id_fkey\` FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`entry_drafts_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`entry_drafts_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`
        CREATE TABLE \`global_drafts\` (
            \`global_id\` text NOT NULL,
            \`locale\` text NOT NULL,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL,
            \`created_by\` text,
            \`updated_by\` text,
            PRIMARY KEY (\`global_id\`, \`locale\`),
            CONSTRAINT \`global_drafts_global_id_fkey\` FOREIGN KEY (\`global_id\`) REFERENCES \`globals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`global_drafts_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
            CONSTRAINT \`global_drafts_updated_by_fkey\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
}
