import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@/test/harness.js';
import { cronTable } from '@/db/schema.js';

describe('_astromech_cron table', () => {
    it('is created by the package migrations', async () => {
        const db = await createTestDb();
        const rows = await db.all(
            sql`SELECT name FROM sqlite_master WHERE type='table' AND name='_astromech_cron'`
        );
        expect(rows).toHaveLength(1);
    });

    it('round-trips a row (insert + select)', async () => {
        const db = await createTestDb();
        const now = new Date();
        await db.insert(cronTable).values({
            name: 'demo-job',
            schedule: '* * * * *',
            enabled: true,
            nextRun: now,
        });
        const got = await db.select().from(cronTable);
        expect(got).toHaveLength(1);
        expect(got[0]?.name).toBe('demo-job');
        expect(got[0]?.schedule).toBe('* * * * *');
        expect(got[0]?.enabled).toBe(true);
        expect(got[0]?.lock).toBeNull();
    });
});
