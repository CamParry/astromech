import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * `relationships` names a resource's category its type and an entry's type or a
 * global's key its subtype: `source_type` becomes `source_subtype`, then
 * `source_kind` and `target_kind` become `source_type` and `target_type`. The
 * index is derived from field data, so the table is recreated empty rather than
 * copied (`ops/0015-relationships-type-subtype.ts`). Run `astromech index:rebuild`
 * after this migration: nothing rebuilds the index on its own.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TABLE \`relationships\``.execute(db);
    await sql`
        CREATE TABLE \`relationships\` (
            \`source_id\` text NOT NULL,
            \`source_type\` text NOT NULL CHECK (\`source_type\` IN ('entry', 'global', 'user', 'media')),
            \`source_subtype\` text,
            \`locale\` text NOT NULL,
            \`schema_path\` text NOT NULL,
            \`instance_path\` text NOT NULL,
            \`target_id\` text NOT NULL,
            \`target_type\` text NOT NULL CHECK (\`target_type\` IN ('entry', 'user', 'media')),
            \`source_staged\` integer DEFAULT 0 NOT NULL,
            PRIMARY KEY (\`source_id\`, \`source_type\`, \`locale\`, \`instance_path\`, \`target_id\`, \`target_type\`)
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_rel_target\` ON \`relationships\` (\`target_id\`,\`target_type\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_filter\` ON \`relationships\` (\`source_subtype\`,\`schema_path\`,\`target_id\`)`.execute(
        db
    );
}
