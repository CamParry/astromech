import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Adds `rate_limits`, where Better Auth's rate limiter keeps its counts so every
 * process and Workers isolate on the database shares them. Generated.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`rate_limits\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`key\` text NOT NULL,
            \`count\` integer NOT NULL,
            \`last_request\` integer NOT NULL
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`rate_limits_key_unique\` ON \`rate_limits\` (\`key\`)`.execute(
        db
    );
}
