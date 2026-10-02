/**
 * A deleted user's sessions and approvals go with it, through the cascading
 * references to `users`. Runs on the harness database, which applies this
 * plugin's migration chain after core's.
 */

import type { ChatMessage } from '../../src/types';
import type { User } from '@/types/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrationProvider } from '../../migrations/index';
import { createApprovalsRepository } from '../../src/approvals/repository';
import { assistant } from '../../src/index';
import { createSessionsRepository } from '../../src/sessions/repository';

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'list the pages' }] },
];

const NOW = '2026-01-01T00:00:00.000Z';

let app: PluginTestApp<'assistant'>;

beforeEach(async () => {
    app = await createPluginTestApp('assistant', {
        ...makeTestConfig(),
        plugins: [assistant()],
    });
});

/** A user the plugin's tables can reference. */
function createUser(): Promise<User> {
    return app.users.create({
        data: { email: `${crypto.randomUUID()}@test.dev`, name: 'Test User' },
    });
}

describe('deleting a user', () => {
    it('removes its session and approvals, and leaves another user’s session', async () => {
        const deleted = await createUser();
        const kept = await createUser();
        const sessions = createSessionsRepository(app.db);
        await sessions.upsert(deleted.id, TRANSCRIPT);
        await sessions.upsert(kept.id, TRANSCRIPT);
        await createApprovalsRepository(app.db).createMany([
            {
                userId: deleted.id,
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: 'entries_page_update',
                arguments: { id: 'page_1' },
                destructive: false,
            },
        ]);

        await app.users.delete({ id: deleted.id });

        expect(await userIdsIn('plugin_assistant_sessions')).toEqual([kept.id]);
        expect(await userIdsIn('plugin_assistant_approvals')).toEqual([]);
    });
});

describe('0001_reference-users', () => {
    it('deletes rows whose user is gone, then adds the foreign key', async () => {
        // Put the plugin's tables back to the baseline, which has no foreign key,
        // so these rows go in with enforcement on. The migrator keeps its own
        // bookkeeping table, apart from the one the harness chain filled.
        await sql`DROP TABLE plugin_assistant_approvals`.execute(app.db);
        await sql`DROP TABLE plugin_assistant_sessions`.execute(app.db);
        const migrator = new Migrator({
            db: app.db,
            provider: migrationProvider,
            migrationTableName: 'assistant_test_migration',
            migrationLockTableName: 'assistant_test_migration_lock',
        });
        expect((await migrator.migrateTo('0000_baseline')).error).toBeUndefined();
        const user = await createUser();
        await sql`
            INSERT INTO plugin_assistant_sessions (id, user_id, messages, created_at, updated_at)
            VALUES ('s_kept', ${user.id}, '[]', ${NOW}, ${NOW}),
                   ('s_orphan', 'user_gone', '[]', ${NOW}, ${NOW})
        `.execute(app.db);
        await sql`
            INSERT INTO plugin_assistant_approvals (
                id, user_id, tool_call_id, method, tool_name, destructive, status,
                created_at, expires_at
            )
            VALUES ('a_kept', ${user.id}, 'toolu_1', 'm', 't', 0, 'pending', ${NOW}, ${NOW}),
                   ('a_orphan', 'user_gone', 'toolu_2', 'm', 't', 0, 'pending', ${NOW}, ${NOW})
        `.execute(app.db);

        expect((await migrator.migrateToLatest()).error).toBeUndefined();

        expect(await userIdsIn('plugin_assistant_sessions')).toEqual([user.id]);
        expect(await userIdsIn('plugin_assistant_approvals')).toEqual([user.id]);
        const violations = await sql`PRAGMA foreign_key_check`.execute(app.db);
        expect(violations.rows).toEqual([]);
    });
});

/** The user ids a table's rows belong to, sorted. */
async function userIdsIn(table: string): Promise<string[]> {
    const result = await sql<{ userId: string }>`
        SELECT user_id FROM ${sql.table(table)} ORDER BY user_id
    `.execute(app.db);
    return result.rows.map((row) => row.userId);
}
