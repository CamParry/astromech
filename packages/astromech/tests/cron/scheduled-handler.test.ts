/**
 * Tests for the Cloudflare scheduled handler and scheduler driver wiring.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Updateable } from 'kysely';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { registerCronJob, setSchedulerDriver, getSchedulerDriver } from '@/cron/registry';
import { handleScheduled } from '@/boot/scheduled';
import { interval } from '@/cron/drivers/index';
import { defaultScheduler } from '@/boot/lifecycle';
import { onTick, runDue } from '@/cron/runner';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/schema';
import type { DB } from '@/database/types';
import { globals } from '@/utilities/registry';

// `handleScheduled` reads the config it creates the application from out of the
// virtual module, so a test of it has to serve one. `vi.hoisted` so the factory,
// hoisted above the imports, can close over what `beforeEach` puts here.
const virtualConfig = vi.hoisted(() => {
    return {} as { raw?: unknown };
});

vi.mock('virtual:astromech/config', () => ({
    get rawConfig() {
        return virtualConfig.raw;
    },
}));

beforeEach(async () => {
    delete globalThis.__astromech?.cronJobs;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
    // Clear any held scheduler / interval handle between tests.
    globals().cronInterval = undefined;
    delete globalThis.__astromech?.scheduler;

    await createTestDb();
    const config = makeTestConfig();
    setupTestConfig(config);
    virtualConfig.raw = config;
    // `setupTestConfig` mirrors the boot rather than running it, so the slot
    // `handleScheduled` reads is filled by hand. The created path is covered in
    // `scheduled-boot.test.ts`.
    globals().application = {
        config,
        app: Promise.resolve({ scheduled: (at?: Date) => onTick(at ?? new Date()) }),
    };
});

afterEach(() => {
    delete globalThis.__astromech?.application;
    delete globalThis.__astromech?.cronJobs;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
    globals().cronInterval = undefined;
    delete globalThis.__astromech?.scheduler;
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
        const db = (await import('@/database/registry')).getDb() as Kysely<DB>;
        const past = new Date(seedTime.getTime() - 60_000);
        await db
            .updateTable('_astromech_cron')
            .set(
                encodePatchWith(cronTable, {
                    nextRun: past,
                    lock: null,
                }) as unknown as Updateable<DB['_astromech_cron']>
            )
            .where('name', '=', 'cf-test-job')
            .execute();

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
        setSchedulerDriver(interval());
        expect(getSchedulerDriver()?.name).toBe('interval');
    });

    it('getSchedulerDriver returns null when no driver is set', () => {
        delete globalThis.__astromech?.scheduler;
        expect(getSchedulerDriver()).toBeNull();
    });
});

describe('defaultScheduler', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is the no-op cloudflare driver on Workers', () => {
        vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
        expect(defaultScheduler().name).toBe('cloudflare');
    });

    it('is the in-process ticker everywhere else', () => {
        expect(defaultScheduler().name).toBe('interval');
    });
});
