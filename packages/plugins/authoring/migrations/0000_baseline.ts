import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_authoring_approvals\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`user_id\` text NOT NULL,
            \`tool_use_id\` text NOT NULL,
            \`method\` text NOT NULL,
            \`tool_name\` text NOT NULL,
            \`arguments\` text,
            \`destructive\` integer NOT NULL,
            \`status\` text NOT NULL CHECK (\`status\` IN ('pending', 'approved', 'rejected', 'expired')),
            \`created_at\` text NOT NULL,
            \`expires_at\` text NOT NULL,
            \`resolved_at\` text
        )
    `.execute(db);
}
