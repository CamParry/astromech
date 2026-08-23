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

import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCronRepository } from '@/cron/repository';

const NOW = new Date('2024-06-01T12:00:00.000Z');
const EXPIRY = new Date('2024-06-01T12:05:00.000Z');

let repository: ReturnType<typeof createCronRepository>;

beforeEach(async () => {
    await createTestDb();
    repository = createCronRepository();
});

describe('seedJob', () => {
    it('inserts the row, then leaves a stored one alone', async () => {
        await repository.seedJob({ name: 'job', schedule: '* * * * *', enabled: true });
        await repository.seedJob({ name: 'job', schedule: '0 12 * * *', enabled: false });

        const rows = await repository.due(NOW);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.schedule).toBe('* * * * *');
        expect(rows[0]?.enabled).toBe(true);
    });
});

describe('due', () => {
    beforeEach(async () => {
        // A null nextRun (never computed) is due; the rest are seeded explicitly.
        await repository.seedJob({ name: 'never-run', schedule: '* * * * *' });
        await repository.seedJob({
            name: 'overdue',
            schedule: '* * * * *',
            nextRun: new Date(NOW.getTime() - 1000),
        });
        await repository.seedJob({
            name: 'future',
            schedule: '* * * * *',
            nextRun: new Date(NOW.getTime() + 1000),
        });
        await repository.seedJob({
            name: 'disabled',
            schedule: '* * * * *',
            enabled: false,
            nextRun: new Date(NOW.getTime() - 1000),
        });
    });

    it('returns enabled jobs whose nextRun has passed or is null', async () => {
        const names = (await repository.due(NOW)).map((row) => row.name).sort();
        expect(names).toEqual(['never-run', 'overdue']);
    });

    it('decodes storage values back to domain values', async () => {
        const row = (await repository.due(NOW)).find((r) => r.name === 'overdue');
        expect(row?.enabled).toBe(true);
        expect(row?.nextRun).toBeInstanceOf(Date);
        expect(row?.lock).toBeNull();
    });
});

describe('claim', () => {
    beforeEach(async () => {
        await repository.seedJob({ name: 'job', schedule: '* * * * *' });
    });

    it('elects exactly one winner among concurrent claims', async () => {
        const results = await Promise.all([
            repository.claim('job', NOW, EXPIRY),
            repository.claim('job', NOW, EXPIRY),
            repository.claim('job', NOW, EXPIRY),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('claims an unlocked job, then refuses while that claim is live', async () => {
        expect(await repository.claim('job', NOW, EXPIRY)).toBe(true);
        expect(await repository.claim('job', NOW, EXPIRY)).toBe(false);
    });

    it('reclaims once the previous claim has expired', async () => {
        expect(await repository.claim('job', NOW, EXPIRY)).toBe(true);

        const later = new Date(EXPIRY.getTime() + 1000);
        expect(
            await repository.claim('job', later, new Date(later.getTime() + 1000))
        ).toBe(true);
    });

    it('returns false for a job that does not exist', async () => {
        expect(await repository.claim('missing', NOW, EXPIRY)).toBe(false);
    });
});

describe('recordRunAndRelease', () => {
    beforeEach(async () => {
        await repository.seedJob({ name: 'job', schedule: '* * * * *' });
        await repository.claim('job', NOW, EXPIRY);
    });

    it('records the run and clears the lock when the token matches', async () => {
        const next = new Date(NOW.getTime() + 60_000);
        await repository.recordRunAndRelease('job', EXPIRY, {
            lastRun: NOW,
            nextRun: next,
        });

        const [row] = await repository.due(new Date(next.getTime() + 1000));
        expect(row?.lock).toBeNull();
        expect(row?.lastRun?.getTime()).toBe(NOW.getTime());
        expect(row?.nextRun?.getTime()).toBe(next.getTime());
    });

    it('writes nothing when the token does not match (the ABA guard)', async () => {
        const stale = new Date(EXPIRY.getTime() - 1000);
        await repository.recordRunAndRelease('job', stale, {
            lastRun: NOW,
            nextRun: null,
        });

        // Lock intact, so the live claim still blocks a new one.
        expect(await repository.claim('job', NOW, EXPIRY)).toBe(false);
    });
});
