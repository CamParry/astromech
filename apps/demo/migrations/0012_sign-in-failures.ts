import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Adds `sign_in_failures`, where failed sign-ins are counted per account and per
 * address so a lock or a block holds across processes and Workers isolates.
 * Generated.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`sign_in_failures\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`key\` text NOT NULL,
            \`count\` integer NOT NULL,
            \`window_start\` integer NOT NULL,
            \`lock_count\` integer DEFAULT 0 NOT NULL,
            \`locked_until\` integer
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`sign_in_failures_key_unique\` ON \`sign_in_failures\` (\`key\`)`.execute(
        db
    );
}
