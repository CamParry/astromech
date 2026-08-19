import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_backups_runs\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`key\` text,
            \`status\` text NOT NULL CHECK (\`status\` IN ('running', 'success', 'failed')),
            \`trigger\` text NOT NULL CHECK (\`trigger\` IN ('scheduled', 'manual', 'pre-restore')),
            \`size_bytes\` integer,
            \`error\` text,
            \`started_at\` text NOT NULL,
            \`finished_at\` text,
            \`artifact_deleted_at\` text
        )
    `.execute(db);
}
