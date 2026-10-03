/**
 * `apps/demo/migrations/0009_entry-content-trashed.ts` adds `entry_content.trashed`
 * and marks the content rows of entries already in the trash. The chain before it
 * is applied by hand, and the rows are seeded before the migration under test.
 */

import type { Kysely } from 'kysely';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { openPlainDb } from '@tests/test-db';
import { sql } from 'kysely';
import { afterEach, beforeEach, expect, it } from 'vitest';

type Migration = { up(db: Kysely<unknown>): Promise<void> };

const LIVE = '01JLIVE0000000000000000000';
const TRASHED = '01JTRASHED000000000000000';
const NOW = '2024-01-01T00:00:00.000Z';

let dir: string;
let db: Kysely<unknown>;

async function loadMigration(file: string): Promise<Migration> {
    return (await import(
        new URL(`../../../../apps/demo/migrations/${file}`, import.meta.url).href
    )) as Migration;
}

async function seedEntry(id: string, deletedAt: string | null): Promise<void> {
    await sql`
        INSERT INTO entries (id, type, deleted_at, created_at, updated_at)
        VALUES (${id}, 'post', ${deletedAt}, ${NOW}, ${NOW})
    `.execute(db);
    for (const locale of ['en', 'de']) {
        await sql`
            INSERT INTO entry_content (
                id, entry_id, type, locale, title, slug, status, created_at, updated_at
            ) VALUES (
                ${`${id}-${locale}`}, ${id}, 'post', ${locale}, 'Same', 'same',
                'unpublished', ${NOW}, ${NOW}
            )
        `.execute(db);
    }
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'astromech-entry-content-trashed-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    db = openPlainDb(client);
    for (const file of [
        '0000_baseline.ts',
        '0001_entry_content.ts',
        '0002_globals.ts',
        '0003_media-content.ts',
        '0004_users-role.ts',
        '0005_user-content.ts',
        '0006_global-relationship-source.ts',
        '0007_drop-settings.ts',
        '0008_drop-version-status.ts',
    ]) {
        await (await loadMigration(file)).up(db);
    }

    // A live entry and a trashed one may not share a slug before the migration.
    await seedEntry(LIVE, null);
    await sql`UPDATE entry_content SET slug = 'other' WHERE entry_id = ${LIVE}`.execute(
        db
    );
    await seedEntry(TRASHED, NOW);

    await (await loadMigration('0009_entry-content-trashed.ts')).up(db);
});

afterEach(async () => {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
});

it('marks the content rows of a trashed entry, in every locale', async () => {
    const result = await sql<{ id: string; trashed: number }>`
        SELECT id, trashed FROM entry_content ORDER BY id
    `.execute(db);

    expect(result.rows).toEqual([
        { id: `${LIVE}-de`, trashed: 0 },
        { id: `${LIVE}-en`, trashed: 0 },
        { id: `${TRASHED}-de`, trashed: 1 },
        { id: `${TRASHED}-en`, trashed: 1 },
    ]);
});

it("lets a live row take a trashed row's slug", async () => {
    await sql`UPDATE entry_content SET slug = 'same' WHERE entry_id = ${LIVE}`.execute(
        db
    );

    const result = await sql<{ slug: string }>`
        SELECT DISTINCT slug FROM entry_content
    `.execute(db);
    expect(result.rows).toEqual([{ slug: 'same' }]);
});
