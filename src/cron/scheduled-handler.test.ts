/**
 * Tests for the Cloudflare scheduled handler and scheduler driver wiring.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, makeTestConfig, setupTestConfig } from '@/test/harness.js';
import {
    registerCronJob,
    setSchedulerDriver,
    getSchedulerDriver,
} from '@/cron/registry.js';
import { cronTable } from '@/db/schema.js';
import { handleScheduled } from '@/cron/index.js';
import { nodeDriver } from '@/cron/drivers/index.js';
import { runDue } from '@/cron/runner.js';

beforeEach(async () => {
    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();
    // Clear any held scheduler / node interval between tests.
    globalThis.__astromechCronInterval = undefined;
    globalThis.__astromechScheduler = undefined;

    await createTestDb();
    setupTestConfig(makeTestConfig());
});

afterEach(() => {
    globalThis.__astromechCronJobs = [];
    globalThis.__astromechCronTickRunning = false;
    globalThis.__astromechCronUnscheduledWarned = new Set();
    globalThis.__astromechCronInterval = undefined;
    globalThis.__astromechScheduler = undefined;
});

describe('handleScheduled', () => {
    it('drives due-eval for a registered job via a mocked Worker event', async () => {
        let ran = false;

        registerCronJob({
            name: 'cf-test-job',
            schedule: '* * * * *',
            handler: async () => {
                ran = true;
            },
        });

        // Use a fixed epoch so the test is deterministic.
        const seedTime = new Date('2024-06-01T12:00:00.000Z');

        // First call seeds the table (inserts a row with nextRun in the future).
        // The seed tick does not fire the handler (nextRun is after seedTime).
        await runDue(seedTime);

        // Manually set nextRun to a past date so the job is due.
        const db = (await import('@/db/registry.js')).getDb();
        const past = new Date(seedTime.getTime() - 60_000);
        await db
            .update(cronTable)
            .set({ nextRun: past, lock: null })
            .where(eq(cronTable.name, 'cf-test-job'));

        // Simulate the Cloudflare Worker `scheduled` event.
        const scheduledTime = seedTime.getTime();
        await handleScheduled({ scheduledTime });

        expect(ran).toBe(true);
    });

    it('does not run a job whose nextRun is in the future', async () => {
        let ran = false;

        registerCronJob({
            name: 'cf-future-job',
            schedule: '* * * * *',
            handler: async () => {
                ran = true;
            },
        });

        const seedTime = new Date('2024-06-01T12:00:00.000Z');

        // First tick seeds the table; nextRun is set to a future minute boundary
        // (after seedTime), so the handler does not run on this tick.
        await handleScheduled({ scheduledTime: seedTime.getTime() });

        // Tick again at the same time — nextRun is still in the future.
        await handleScheduled({ scheduledTime: seedTime.getTime() });

        expect(ran).toBe(false);
    });
});

describe('scheduler driver selection', () => {
    it('setSchedulerDriver / getSchedulerDriver round-trips via globalThis', () => {
        setSchedulerDriver(nodeDriver);
        expect(getSchedulerDriver()?.name).toBe('node');
    });

    it('getSchedulerDriver returns null when no driver is set', () => {
        globalThis.__astromechScheduler = undefined;
        expect(getSchedulerDriver()).toBeNull();
    });
});
