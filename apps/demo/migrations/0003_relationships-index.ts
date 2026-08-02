import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TABLE \`relationships\``.execute(db);
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
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);
    await sql`
        CREATE TABLE \`__new_entry_versions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`entry_id\` text NOT NULL,
            \`version_number\` integer NOT NULL,
            \`title\` text NOT NULL,
            \`slug\` text,
            \`fields\` text,
            \`status\` text CHECK (\`status\` IN ('unpublished', 'published', 'scheduled')),
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`entry_versions_entry_id_fkey\` FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
            CONSTRAINT \`entry_versions_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
        )
    `.execute(db);
    await sql`INSERT INTO \`__new_entry_versions\` (\`id\`, \`entry_id\`, \`version_number\`, \`title\`, \`slug\`, \`fields\`, \`status\`, \`created_at\`, \`created_by\`) SELECT \`id\`, \`entry_id\`, \`version_number\`, \`title\`, \`slug\`, \`fields\`, \`status\`, \`created_at\`, \`created_by\` FROM \`entry_versions\``.execute(
        db
    );
    await sql`DROP TABLE \`entry_versions\``.execute(db);
    await sql`ALTER TABLE \`__new_entry_versions\` RENAME TO \`entry_versions\``.execute(
        db
    );
    await sql`CREATE INDEX \`idx_versions_entry\` ON \`entry_versions\` (\`entry_id\`,\`version_number\`)`.execute(
        db
    );
}
