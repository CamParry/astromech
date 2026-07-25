import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_redirects_redirects\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`from\` text NOT NULL,
            \`to\` text NOT NULL,
            \`status\` text DEFAULT '301' NOT NULL,
            \`enabled\` integer DEFAULT 1 NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL
        )
    `.execute(db);
}
