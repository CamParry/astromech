/**
 * Cron repository — the three methods that had to drop to `query()` because the
 * flat `where` DSL cannot express them.
 *
 * The CAS claim is the one worth pinning directly: `claim` returning `true` is
 * what decides whether a tick runs a job, so a comparison bug there means every
 * tick either always claims (double-fire) or never claims (nothing ever runs) —
 * both silent. `runner.test.ts` covers it end-to-end through concurrent
 * `runDue` passes; these assert the single-winner election on its own.
 */

import type { NewCronRow } from '@/database/tables';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { cronRepository } from '@/cron/repository';
import { createRepository } from '@/database/repository/create-repository';
import { cronTable } from '@/database/tables';

const NOW = new Date('2024-06-01T12:00:00.000Z');
const EXPIRY = new Date('2024-06-01T12:05:00.000Z');

beforeEach(async () => {
    await createTestDb();
});

/** Store a job's row in the state a test needs. */
async function insertJob(row: NewCronRow): Promise<void> {
    await createRepository(cronTable).create(row);
}

describe('due', () => {
    beforeEach(async () => {
        // A null nextRun (never computed) is due; the rest are seeded explicitly.
        await insertJob({ name: 'never-run', schedule: '* * * * *' });
        await insertJob({
            name: 'overdue',
            schedule: '* * * * *',
            nextRun: new Date(NOW.getTime() - 1000),
        });
        await insertJob({
            name: 'future',
            schedule: '* * * * *',
            nextRun: new Date(NOW.getTime() + 1000),
        });
        await insertJob({
            name: 'disabled',
            schedule: '* * * * *',
            enabled: false,
            nextRun: new Date(NOW.getTime() - 1000),
        });
    });

    it('returns enabled jobs whose nextRun has passed or is null', async () => {
        const names = (await cronRepository.due(NOW)).map((row) => row.name).sort();
        expect(names).toEqual(['never-run', 'overdue']);
    });

    it('decodes storage values back to domain values', async () => {
        const row = (await cronRepository.due(NOW)).find((r) => r.name === 'overdue');
        expect(row?.enabled).toBe(true);
        expect(row?.nextRun).toBeInstanceOf(Date);
        expect(row?.lock).toBeNull();
    });
});

describe('claim', () => {
    beforeEach(async () => {
        await insertJob({ name: 'job', schedule: '* * * * *' });
    });

    it('elects exactly one winner among concurrent claims', async () => {
        const results = await Promise.all([
            cronRepository.claim('job', NOW, EXPIRY),
            cronRepository.claim('job', NOW, EXPIRY),
            cronRepository.claim('job', NOW, EXPIRY),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('claims an unlocked job, then refuses while that claim is live', async () => {
        expect(await cronRepository.claim('job', NOW, EXPIRY)).toBe(true);
        expect(await cronRepository.claim('job', NOW, EXPIRY)).toBe(false);
    });

    it('reclaims once the previous claim has expired', async () => {
        expect(await cronRepository.claim('job', NOW, EXPIRY)).toBe(true);

        const later = new Date(EXPIRY.getTime() + 1000);
        expect(
            await cronRepository.claim('job', later, new Date(later.getTime() + 1000))
        ).toBe(true);
    });

    it('returns false for a job that does not exist', async () => {
        expect(await cronRepository.claim('missing', NOW, EXPIRY)).toBe(false);
    });
});

describe('recordRunAndRelease', () => {
    beforeEach(async () => {
        await insertJob({ name: 'job', schedule: '* * * * *' });
        await cronRepository.claim('job', NOW, EXPIRY);
    });

    it('records the run and clears the lock when the token matches', async () => {
        const next = new Date(NOW.getTime() + 60_000);
        await cronRepository.recordRunAndRelease('job', EXPIRY, {
            lastRun: NOW,
            lastResult: 'ok',
            lastError: null,
            nextRun: next,
        });

        const [row] = await cronRepository.due(new Date(next.getTime() + 1000));
        expect(row?.lock).toBeNull();
        expect(row?.lastRun?.getTime()).toBe(NOW.getTime());
        expect(row?.nextRun?.getTime()).toBe(next.getTime());
    });

    it('writes nothing when the token does not match (the ABA guard)', async () => {
        const stale = new Date(EXPIRY.getTime() - 1000);
        await cronRepository.recordRunAndRelease('job', stale, {
            lastRun: NOW,
            lastResult: 'ok',
            lastError: null,
            nextRun: null,
        });

        // Lock intact, so the live claim still blocks a new one.
        expect(await cronRepository.claim('job', NOW, EXPIRY)).toBe(false);
    });
});
