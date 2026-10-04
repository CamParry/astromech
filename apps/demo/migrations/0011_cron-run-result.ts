import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE \`_astromech_cron\` ADD COLUMN \`last_result\` text CHECK (\`last_result\` IN ('ok', 'error'))`.execute(
        db
    );
    await sql`ALTER TABLE \`_astromech_cron\` ADD COLUMN \`last_error\` text`.execute(db);
}
