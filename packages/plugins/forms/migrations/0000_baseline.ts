import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_forms_submissions\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`form_id\` text NOT NULL,
            \`form_slug\` text NOT NULL,
            \`data\` text NOT NULL,
            \`summary\` text,
            \`meta\` text,
            \`submitted_at\` text NOT NULL,
            \`created_at\` text NOT NULL,
            \`updated_at\` text NOT NULL
        )
    `.execute(db);
    await sql`CREATE INDEX \`plugin_forms_idx_form_id\` ON \`plugin_forms_submissions\` (\`form_id\`)`.execute(
        db
    );
}
