/**
 * `apps/demo/migrations/0005_user-content.ts` moves `users.fields` out to
 * `user_content`. The whole chain is applied so the move runs against the
 * columns the earlier migrations actually left behind, and a user row carrying
 * field data is seeded before it to prove the values survive.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, sql } from 'kysely';
import { afterEach, beforeEach, expect, it } from 'vitest';

type Migration = { up(db: Kysely<unknown>): Promise<void> };

const USER_ID = '01JUSER0000000000000000000';

let dir: string;
let db: Kysely<unknown>;

async function loadMigration(file: string): Promise<Migration> {
    return (await import(
        new URL(`../../../../apps/demo/migrations/${file}`, import.meta.url).href
    )) as Migration;
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-user-content-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    const baseline = await loadMigration('0000_baseline.ts');
    await baseline.up(db);

    await sql`
        INSERT INTO users (
            id, email, name, email_verified, image, fields, role_slug,
            created_at, updated_at
        ) VALUES (
            ${USER_ID}, 'editor@test.dev', 'Editor', 1, NULL, '{"bio":"x"}', 'editor',
            '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'
        )
    `.execute(db);

    for (const file of [
        '0001_entry_content.ts',
        '0002_globals.ts',
        '0003_media-content.ts',
        '0004_users-role.ts',
        '0005_user-content.ts',
    ]) {
        const migration = await loadMigration(file);
        await migration.up(db);
    }
});

afterEach(async () => {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
});

it('moves each user row fields to a default-locale content row', async () => {
    const result = await sql<{ user_id: string; locale: string; fields: string }>`
        SELECT user_id, locale, fields FROM user_content
    `.execute(db);

    expect(result.rows).toEqual([
        { user_id: USER_ID, locale: 'en', fields: '{"bio":"x"}' },
    ]);
});

it('drops the users.fields column', async () => {
    const info = await sql<{ name: string }>`PRAGMA table_info(users)`.execute(db);

    expect(info.rows.map((row) => row.name)).not.toContain('fields');
});
