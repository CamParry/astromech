/**
 * A deleted user's sessions and approvals go with it, through the cascading
 * references to `users`. Runs on a real libsql database with this plugin's
 * migration chain, and a `users` table holding only the `id` the references
 * point at.
 */

import type { ChatMessage } from '../../src/types';
import type { PluginContext } from 'astromech';
import type { MigrationProvider } from 'kysely/migration';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationProvider as assistantMigrations } from '../../migrations/index';
import { createApprovalsRepository } from '../../src/approvals/repository';
import { createSessionsRepository } from '../../src/sessions/repository';

type Db = PluginContext['db'];

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'list the pages' }] },
];

const NOW = '2026-01-01T00:00:00.000Z';

let dir: string;
let db: Db;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-assistant-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
        plugins: [new CamelCasePlugin()],
    }) as unknown as Db;
    // Core owns `users`; the references need only its primary key.
    await sql`CREATE TABLE users (id text PRIMARY KEY NOT NULL)`.execute(db);
});

afterEach(async () => {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
});

describe('deleting a user', () => {
    it('removes its session and approvals, and leaves another user’s session', async () => {
        await applyMigrations(assistantMigrations);
        await insertUser('user_1');
        await insertUser('user_2');
        const sessions = createSessionsRepository(db);
        await sessions.upsert('user_1', TRANSCRIPT);
        await sessions.upsert('user_2', TRANSCRIPT);
        await createApprovalsRepository(db).createMany([
            {
                userId: 'user_1',
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: 'entries_page_update',
                arguments: { id: 'page_1' },
                destructive: false,
            },
        ]);

        // Core's users service needs a booted app, which this suite does not
        // have, so the user row is deleted directly.
        await sql`DELETE FROM users WHERE id = ${'user_1'}`.execute(db);

        expect(await userIdsIn('plugin_assistant_sessions')).toEqual(['user_2']);
        expect(await userIdsIn('plugin_assistant_approvals')).toEqual([]);
    });
});

describe('0001_reference-users', () => {
    it('deletes rows whose user is gone, then adds the foreign key', async () => {
        await applyMigrations(assistantMigrations, (name) => name === '0000_baseline');
        await insertUser('user_1');
        // The baseline has no foreign key, so these go in with enforcement on.
        await sql`
            INSERT INTO plugin_assistant_sessions (id, user_id, messages, created_at, updated_at)
            VALUES ('s_kept', 'user_1', '[]', ${NOW}, ${NOW}),
                   ('s_orphan', 'user_gone', '[]', ${NOW}, ${NOW})
        `.execute(db);
        await sql`
            INSERT INTO plugin_assistant_approvals (
                id, user_id, tool_call_id, method, tool_name, destructive, status,
                created_at, expires_at
            )
            VALUES ('a_kept', 'user_1', 'toolu_1', 'm', 't', 0, 'pending', ${NOW}, ${NOW}),
                   ('a_orphan', 'user_gone', 'toolu_2', 'm', 't', 0, 'pending', ${NOW}, ${NOW})
        `.execute(db);

        await applyMigrations(assistantMigrations, (name) => name !== '0000_baseline');

        expect(await userIdsIn('plugin_assistant_sessions')).toEqual(['user_1']);
        expect(await userIdsIn('plugin_assistant_approvals')).toEqual(['user_1']);
        const violations = await sql`PRAGMA foreign_key_check`.execute(db);
        expect(violations.rows).toEqual([]);
    });
});

/** Run a provider's migrations in name order, skipping those `include` rejects. */
async function applyMigrations(
    provider: MigrationProvider,
    include: (name: string) => boolean = () => true
): Promise<void> {
    const migrations = Object.entries(await provider.getMigrations()).sort(([a], [b]) =>
        a.localeCompare(b)
    );
    for (const [name, migration] of migrations) {
        if (include(name)) await migration.up(db);
    }
}

async function insertUser(id: string): Promise<void> {
    await sql`INSERT INTO users (id) VALUES (${id})`.execute(db);
}

/** The user ids a table's rows belong to, sorted. */
async function userIdsIn(table: string): Promise<string[]> {
    const result = await sql<{ userId: string }>`
        SELECT user_id FROM ${sql.table(table)} ORDER BY user_id
    `.execute(db);
    return result.rows.map((row) => row.userId);
}
