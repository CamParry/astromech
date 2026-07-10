import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Insertable } from 'kysely';
import { createTestDb } from '@tests/harness.js';
import { encode, decode } from '@/database/codec.js';
import type { DB } from '@/database/types.js';

describe('_astromech_cron table', () => {
    it('is created by the package migrations', async () => {
        const db = await createTestDb();
        const { rows } =
            await sql`SELECT name FROM sqlite_master WHERE type='table' AND name='_astromech_cron'`.execute(
                db
            );
        expect(rows).toHaveLength(1);
    });

    it('round-trips a row (insert + select)', async () => {
        const db = await createTestDb();
        const now = new Date();
        await db
            .insertInto('_astromech_cron')
            .values(
                encode('_astromech_cron', {
                    name: 'demo-job',
                    schedule: '* * * * *',
                    enabled: true,
                    nextRun: now,
                }) as unknown as Insertable<DB['_astromech_cron']>
            )
            .execute();
        const rows = await db.selectFrom('_astromech_cron').selectAll().execute();
        const got = rows.map((r) => decode('_astromech_cron', r));
        expect(got).toHaveLength(1);
        expect(got[0]?.name).toBe('demo-job');
        expect(got[0]?.schedule).toBe('* * * * *');
        expect(got[0]?.enabled).toBe(true);
        expect(got[0]?.lock).toBeNull();
    });
});
