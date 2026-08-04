import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_authoring_sessions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`user_id\` text NOT NULL,
            \`messages\` text NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`plugin_authoring_sessions_user_id_unique\` ON \`plugin_authoring_sessions\` (\`user_id\`)`.execute(
        db
    );
}
