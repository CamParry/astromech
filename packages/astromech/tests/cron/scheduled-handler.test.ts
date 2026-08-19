/**
 * Tests for the Cloudflare worker entry's scheduled handler and the scheduler
 * driver wiring it nominates.
 */

import type { DB } from '@/database/types';
import type { Kysely, Updateable } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudflareCron, interval, webhook } from '@/cron/drivers/index';
import {
    getSchedulerDriver,
    registerCronJob,
    resolveSchedulerDriver,
    setDefaultScheduler,
    setSchedulerDriver,
} from '@/cron/registry';
import { onTick, runDue } from '@/cron/runner';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/schema';
import { createWorkerEntry } from '@/integrations/cloudflare/index';
import { globals } from '@/registry';

// The scheduled handler reads the config it creates the application from out of
// the virtual module, so a test of it has to serve one. `vi.hoisted` so the factory,
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
    delete globalThis.__astromech?.defaultScheduler;

    await createTestDb();
    const config = makeTestConfig();
    setupTestConfig(config);
    virtualConfig.raw = config;
    // `setupTestConfig` mirrors the boot rather than running it, so the slot
    // the scheduled handler reads is filled by hand. The created path is covered in
    // `scheduled-boot.test.ts`.
    globals().astromech = {
        config,
        app: Promise.resolve({ scheduled: (at?: Date) => onTick(at ?? new Date()) }),
    };
});

afterEach(() => {
    delete globalThis.__astromech?.astromech;
    delete globalThis.__astromech?.cronJobs;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
    globals().cronInterval = undefined;
    delete globalThis.__astromech?.scheduler;
    delete globalThis.__astromech?.defaultScheduler;
});

/** A stand-in for the Astro adapter's worker entry. */
function astroEntry(): { fetch: () => Response } {
    return { fetch: () => new Response('astro') };
}

describe('createWorkerEntry().scheduled', () => {
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
        await createWorkerEntry(astroEntry()).scheduled({ scheduledTime });

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
        const worker = createWorkerEntry(astroEntry());
        await worker.scheduled({ scheduledTime: seedTime.getTime() });

        // Tick again at the same time — nextRun is still in the future.
        await worker.scheduled({ scheduledTime: seedTime.getTime() });

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

describe('resolveSchedulerDriver', () => {
    it('is the in-process ticker when nothing is registered', () => {
        expect(resolveSchedulerDriver().name).toBe('interval');
    });

    it('is the registered default when an integration supplies one', () => {
        setDefaultScheduler(cloudflareCron);
        expect(resolveSchedulerDriver().name).toBe('cloudflare');
    });

    it('lets the config win over the registered default', () => {
        setDefaultScheduler(cloudflareCron);
        expect(resolveSchedulerDriver(webhook()).name).toBe('webhook');
    });

    it('is nominated by createWorkerEntry', () => {
        createWorkerEntry(astroEntry());
        expect(resolveSchedulerDriver().name).toBe('cloudflare');
    });
});
