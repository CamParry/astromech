import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`_astromech_plugins\` (
            \`alias\` text PRIMARY KEY NOT NULL,
            \`version\` text NOT NULL,
            \`installed_at\` text NOT NULL
        )
    `.execute(db);
}
