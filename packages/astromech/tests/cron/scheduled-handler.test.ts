/**
 * Tests for the Cloudflare worker entry's scheduled handler and the scheduler
 * driver wiring it nominates.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { createAstromech } from '@/astromech';
import { cloudflareCron } from '@/cron/drivers/cloudflare';
import { interval } from '@/cron/drivers/interval';
import { webhook } from '@/cron/drivers/webhook';
import {
    getSchedulerDriver,
    registerCronJob,
    resolveSchedulerDriver,
    setDefaultScheduler,
    setSchedulerDriver,
} from '@/cron/registry';
import { runDue } from '@/cron/runner';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/tables';
import { createWorkerEntry } from '@/integrations/cloudflare/worker';

beforeEach(async () => {
    await createTestDb();
    config = makeBootConfig();
});

/** The site config the worker entry is built with, rebuilt per test. */
let config: AstromechConfig;

/** A stand-in for the Astro adapter's worker entry. */
function astroEntry(): { fetch: () => Response } {
    return { fetch: () => new Response('astro') };
}

/** The worker entry under test, built with the config the harness published. */
function worker() {
    return createWorkerEntry(astroEntry(), { config });
}

describe('createWorkerEntry().scheduled', () => {
    // The application already exists, as it does once a request has created
    // it. A tick on an uncreated application is `scheduled-boot.test.ts`.
    beforeEach(async () => {
        await createAstromech({ config });
    });

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
        await runDue(seedTime, systemAppContext());

        // Manually set nextRun to a past date so the job is due.
        const db = (await import('@/database/registry')).getDb() as Kysely<DB>;
        const past = new Date(seedTime.getTime() - 60_000);
        await db
            .updateTable('_astromech_cron')
            .set(
                encodePatchWith(cronTable, {
                    nextRun: past,
                    lock: null,
                })
            )
            .where('name', '=', 'cf-test-job')
            .execute();

        // Simulate the Cloudflare Worker `scheduled` event.
        const scheduledTime = seedTime.getTime();
        await worker().scheduled({ scheduledTime }, {});

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
        const entry = worker();
        await entry.scheduled({ scheduledTime: seedTime.getTime() }, {});

        // Tick again at the same time — nextRun is still in the future.
        await entry.scheduled({ scheduledTime: seedTime.getTime() }, {});

        expect(ran).toBe(false);
    });
});

describe('scheduler driver selection', () => {
    // The registry itself is under test here, so the driver is set by hand.
    it('setSchedulerDriver / getSchedulerDriver round-trips via globalThis', () => {
        setSchedulerDriver(interval());
        expect(getSchedulerDriver()?.name).toBe('interval');
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
        worker();
        expect(resolveSchedulerDriver().name).toBe('cloudflare');
    });
});
