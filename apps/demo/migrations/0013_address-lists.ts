import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Adds `blocked_addresses` and `allowed_addresses`, the block list and the allow
 * list that override it. Generated.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE TABLE \`allowed_addresses\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`address\` text NOT NULL,
            \`reason\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`allowed_addresses_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`allowed_addresses_address_unique\` ON \`allowed_addresses\` (\`address\`)`.execute(
        db
    );
    await sql`
        CREATE TABLE \`blocked_addresses\` (
            \`id\` text PRIMARY KEY NOT NULL,
            \`address\` text NOT NULL,
            \`reason\` text,
            \`source\` text NOT NULL CHECK (\`source\` IN ('automatic', 'manual')),
            \`expires_at\` text,
            \`created_at\` text NOT NULL,
            \`created_by\` text,
            CONSTRAINT \`blocked_addresses_created_by_fkey\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
        )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX \`blocked_addresses_address_unique\` ON \`blocked_addresses\` (\`address\`)`.execute(
        db
    );
}
