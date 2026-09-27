import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);
    await sql`
        CREATE TABLE \`__new_entry_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`entry_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`entry_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`entry_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`INSERT INTO \`__new_entry_versions\` (\`id\`, \`content_id\`, \`version\`, \`title\`, \`slug\`, \`fields\`, \`created_at\`, \`created_by\`) SELECT \`id\`, \`content_id\`, \`version\`, \`title\`, \`slug\`, \`fields\`, \`created_at\`, \`created_by\` FROM \`entry_versions\``.execute(
        db
    );
    await sql`DROP TABLE \`entry_versions\``.execute(db);
    await sql`ALTER TABLE \`__new_entry_versions\` RENAME TO \`entry_versions\``.execute(
        db
    );
    await sql`CREATE INDEX \`idx_entry_versions_content\` ON \`entry_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);
    await sql`
        CREATE TABLE \`__new_global_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`content_id\` text NOT NULL,
            \`version\` integer NOT NULL,
            \`fields\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`global_versions_content_id_fkey\` FOREIGN KEY (\`content_id\`) REFERENCES \`global_content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`global_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`INSERT INTO \`__new_global_versions\` (\`id\`, \`content_id\`, \`version\`, \`fields\`, \`created_at\`, \`created_by\`) SELECT \`id\`, \`content_id\`, \`version\`, \`fields\`, \`created_at\`, \`created_by\` FROM \`global_versions\``.execute(
        db
    );
    await sql`DROP TABLE \`global_versions\``.execute(db);
    await sql`ALTER TABLE \`__new_global_versions\` RENAME TO \`global_versions\``.execute(
        db
    );
    await sql`CREATE INDEX \`idx_global_versions_content\` ON \`global_versions\` (\`content_id\`,\`version\`)`.execute(
        db
    );
}
