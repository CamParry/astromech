import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * `relationships` gains a NOT NULL `locale`, part of its primary key. The index
 * is derived from field data, so the table is recreated empty rather than
 * backfilled (`ops/0014-relationships-locale.ts`). Run `astromech index:rebuild`
 * after this migration: nothing rebuilds the index on its own.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TABLE \`relationships\``.execute(db);
    await sql`
        CREATE TABLE \`relationships\` (
            \`source_id\` text NOT NULL,
            \`source_kind\` text NOT NULL CHECK (\`source_kind\` IN ('entry', 'global', 'user', 'media')),
            \`source_type\` text,
            \`locale\` text NOT NULL,
            \`schema_path\` text NOT NULL,
            \`instance_path\` text NOT NULL,
            \`target_id\` text NOT NULL,
            \`target_kind\` text NOT NULL CHECK (\`target_kind\` IN ('entry', 'user', 'media')),
            \`source_staged\` integer DEFAULT 0 NOT NULL,
            PRIMARY KEY (\`source_id\`, \`source_kind\`, \`locale\`, \`instance_path\`, \`target_id\`, \`target_kind\`)
        )
    `.execute(db);
    await sql`CREATE INDEX \`idx_rel_target\` ON \`relationships\` (\`target_id\`,\`target_kind\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`idx_rel_filter\` ON \`relationships\` (\`source_type\`,\`schema_path\`,\`target_id\`)`.execute(
        db
    );
}
