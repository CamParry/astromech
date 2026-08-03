import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE \`media\` ADD \`title\` text`.execute(db);
    await sql`ALTER TABLE \`media\` ADD \`caption\` text`.execute(db);
}
