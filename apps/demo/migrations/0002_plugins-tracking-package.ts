import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TABLE \`_astromech_plugins\``.execute(db);
    await sql`
        CREATE TABLE \`_astromech_plugins\` (
            \`package\` text PRIMARY KEY NOT NULL,
            \`namespace\` text NOT NULL,
            \`version\` text NOT NULL,
            \`installed_at\` text NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`_astromech_plugins_namespace_unique\` ON \`_astromech_plugins\` (\`namespace\`)`.execute(
        db
    );
}
