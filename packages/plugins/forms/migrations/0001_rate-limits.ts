import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`plugin_forms_rate_limits\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`address\` text NOT NULL,
            \`form_id\` text NOT NULL,
            \`window_start\` integer NOT NULL,
            \`count\` integer NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`plugin_forms_idx_rate_limits_address_form_id\` ON \`plugin_forms_rate_limits\` (\`address\`,\`form_id\`)`.execute(
        db
    );
    await sql`CREATE INDEX \`plugin_forms_idx_rate_limits_window_start\` ON \`plugin_forms_rate_limits\` (\`window_start\`)`.execute(
        db
    );
}
