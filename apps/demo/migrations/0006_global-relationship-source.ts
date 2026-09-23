import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`PRAGMA defer_foreign_keys = true`.execute(db);
    await sql`
        CREATE TABLE \`__new_relationships\` (
            \`source_id\` text NOT NULL,
            \`source_kind\` text NOT NULL CHECK (\`source_kind\` IN ('entry', 'global', 'user', 'media')),
            \`source_type\` text,
            \`schema_path\` text NOT NULL,
            \`instance_path\` text NOT NULL,
            \`target_id\` text NOT NULL,
            \`target_kind\` text NOT NULL CHECK (\`target_kind\` IN ('entry', 'user', 'media')),
            \`source_staged\` integer DEFAULT 0 NOT NULL,
            PRIMARY KEY (\`source_id\`, \`source_kind\`, \`instance_path\`, \`target_id\`, \`target_kind\`)
        )
    `.execute(db);
    await sql`INSERT INTO \`__new_relationships\` (\`source_id\`, \`source_kind\`, \`source_type\`, \`schema_path\`, \`instance_path\`, \`target_id\`, \`target_kind\`, \`source_staged\`) SELECT \`source_id\`, \`source_kind\`, \`source_type\`, \`schema_path\`, \`instance_path\`, \`target_id\`, \`target_kind\`, \`source_staged\` FROM \`relationships\``.execute(
        db
    );
    await sql`DROP TABLE \`relationships\``.execute(db);
    await sql`ALTER TABLE \`__new_relationships\` RENAME TO \`relationships\``.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_target\` ON \`relationships\` (\`target_id\`,\`target_kind\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_filter\` ON \`relationships\` (\`source_type\`,\`schema_path\`,\`target_id\`)`.execute(
        db
    );
}
