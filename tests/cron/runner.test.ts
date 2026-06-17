/**
 * Tests for the cron due-evaluator: onTick / runDue.
 *
 * Timestamp granularity note: cronTable columns use `{ mode: 'timestamp' }` which
 * stores as Unix seconds (integer). Croner returns whole-minute boundaries so
 * this is lossless for minute-resolution schedules. For nextRun comparisons we
 * compare at second resolution (truncate ms) to be safe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Cron } from 'croner';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { registerCronJob } from '@/cron/registry.js';
import { cronTable } from '@/db/schema.js';
import { onTick, runDue } from '@/cron/runner.js';
import type { CronRow } from '@/db/schema.js';

// Truncate to second resolution to match DB storage.
function toSecond(d: Date): number {
    return Math.floor(d.getTime() / 1000);
}

/** Assert rows has exactly one element and return it. */
function singleRow(rows: CronRow[]): CronRow {
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    return row as CronRow;
}

beforeEach(async () => {
    // Reset all cron globalThis state between tests.
    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();

    await createTestDb();
    setupTestConfig(makeTestConfig());
});

afterEach(() => {
    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();
});

describe('onTick / runDue', () => {
    it('1. lazy seed: inserts one row, does not duplicate on second tick, does not overwrite admin-edited schedule', async () => {
        const now = new Date('2024-06-01T00:00:00.000Z');

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => undefined,
        });

        await onTick(now);

        const db = (await import('@/db/registry.js')).getDb();
        const row = singleRow(await db.select().from(cronTable));
        expect(row.name).toBe('test-job');
        expect(row.enabled).toBe(true);
        expect(row.schedule).toBe('* * * * *');
        expect(row.nextRun).toBeInstanceOf(Date);
        expect(row.nextRun?.getTime()).toBeGreaterThan(now.getTime());

        // Admin edits the schedule between ticks.
        await db
            .update(cronTable)
            .set({ schedule: '0 12 * * *' })
            .where(eq(cronTable.name, 'test-job'));

        const now2 = new Date('2024-06-01T00:02:00.000Z');
        await onTick(now2);

        const row2 = singleRow(await db.select().from(cronTable));
        // Admin-edited schedule must survive.
        expect(row2.schedule).toBe('0 12 * * *');
    });

    it('2. due-eval honors STORED schedule: past nextRun runs handler; future nextRun skips it', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        // Seed the row first.
        await onTick(new Date('2024-06-01T11:00:00.000Z'));
        callCount = 0; // reset after seed tick (it may have run)

        const db = (await import('@/db/registry.js')).getDb();

        // Set nextRun in the past → should run.
        const past = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);
        expect(callCount).toBe(1);

        // Set nextRun in the future → should NOT run.
        callCount = 0;
        const future = new Date(now.getTime() + 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: future, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);
        expect(callCount).toBe(0);
    });

    it('3. disabled jobs are skipped', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        // Seed the row.
        await onTick(new Date('2024-06-01T11:00:00.000Z'));

        const db = (await import('@/db/registry.js')).getDb();

        // Make it due but disabled.
        const past = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, enabled: false, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        callCount = 0;
        await onTick(now);
        expect(callCount).toBe(0);
    });

    it('4. edited schedule takes effect on next tick recompute', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => undefined,
        });

        // First tick: seed + run (nextRun is computed from '* * * * *').
        await onTick(now);

        const db = (await import('@/db/registry.js')).getDb();

        // Admin changes schedule to daily midnight, and forces it due.
        const past = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ schedule: '0 0 * * *', nextRun: past, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);

        const row = singleRow(await db.select().from(cronTable));

        // nextRun must have been recomputed using the new '0 0 * * *' schedule.
        const expectedNext = new Cron('0 0 * * *', { timezone: 'UTC' }).nextRun(now);
        expect(expectedNext).not.toBeNull();
        expect(toSecond(row.nextRun as Date)).toBe(toSecond(expectedNext as Date));
    });

    it('5. DB lock prevents double-fire (concurrent runDue)', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        // Seed + make it due.
        await runDue(new Date('2024-06-01T11:00:00.000Z'));
        callCount = 0;

        const db = (await import('@/db/registry.js')).getDb();
        const past = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        // Two concurrent passes — only one should win the CAS claim.
        await Promise.all([runDue(now), runDue(now)]);

        expect(callCount).toBe(1);
    });

    it('6. overlap guard: second onTick skips when first is still running', async () => {
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        const now = new Date('2024-06-01T12:00:00.000Z');

        // Simulate a tick already running.
        globalThis.__astromechCronTickRunning = true;

        await onTick(now);
        expect(callCount).toBe(0);

        // Clean up.
        globalThis.__astromechCronTickRunning = false;
    });

    it('7. fresh lock blocks; expired lock reclaims', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        // Seed.
        await runDue(new Date('2024-06-01T11:00:00.000Z'));
        callCount = 0;

        const db = (await import('@/db/registry.js')).getDb();
        const past = new Date(now.getTime() - 60_000);

        // Set lock to FUTURE expiry (claim active) → should NOT run.
        const futureLock = new Date(now.getTime() + 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: futureLock })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);
        expect(callCount).toBe(0);

        // Set lock to PAST expiry (stale claim) → should reclaim and run.
        const pastLock = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: pastLock })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);
        expect(callCount).toBe(1);
    });

    it('8. handler throw: onTick resolves, console.error called, nextRun advanced, lock cleared', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                throw new Error('boom');
            },
        });

        // Seed + make due.
        await runDue(new Date('2024-06-01T11:00:00.000Z'));
        const db = (await import('@/db/registry.js')).getDb();
        const past = new Date(now.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        // Must not throw.
        await expect(onTick(now)).resolves.toBeUndefined();

        // console.error was called with the job name.
        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('test-job'),
            expect.any(Error)
        );

        // Row: lock cleared, nextRun advanced.
        const row = singleRow(await db.select().from(cronTable));
        expect(row.lock).toBeNull();
        expect(row.nextRun).toBeInstanceOf(Date);
        expect(row.nextRun?.getTime()).toBeGreaterThan(now.getTime());

        consoleError.mockRestore();
    });

    it('9. missed run fires once, no backfill; second tick skips', async () => {
        const now = new Date('2024-06-01T12:00:00.000Z');
        let callCount = 0;

        registerCronJob({
            name: 'test-job',
            schedule: '* * * * *',
            handler: async () => {
                callCount++;
            },
        });

        // Seed + set nextRun far in the past.
        await runDue(new Date('2024-06-01T11:00:00.000Z'));
        callCount = 0;

        const db = (await import('@/db/registry.js')).getDb();
        const veryPast = new Date('2024-01-01T00:00:00.000Z');
        await db
            .update(cronTable)
            .set({ nextRun: veryPast, lock: null })
            .where(eq(cronTable.name, 'test-job'));

        await onTick(now);
        expect(callCount).toBe(1);

        // nextRun should have advanced to a future time.
        const row = singleRow(await db.select().from(cronTable));
        expect(row.nextRun?.getTime()).toBeGreaterThan(now.getTime());

        // Second immediate tick — should NOT run again.
        await onTick(now);
        expect(callCount).toBe(1);
    });
});
