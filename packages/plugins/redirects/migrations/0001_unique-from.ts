import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`CREATE UNIQUE INDEX \`plugin_redirects_redirects_from_unique\` ON \`plugin_redirects_redirects\` (\`from\`)`.execute(
        db
    );
}
