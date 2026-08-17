/**
 * A Cron Trigger fires `scheduled()`, never `fetch()`, so the worker entry's
 * scheduled handler is reached with nothing booted. Its own file because it mocks
 * `virtual:astromech/config` to feed the real boot, where the rest of the suite
 * publishes a resolved config through the harness.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { Updateable } from 'kysely';
import { createTestDb, makeTestConfig } from '@tests/harness';
import { registerCronJob } from '@/cron/registry';
import { interval } from '@/cron/drivers/index';
import { createWorkerEntry } from '@/integrations/cloudflare/index';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/schema';
import type { DB } from '@/database/types';
import { globals } from '@/utilities/registry';

// Holds what the mocked virtual module serves. `vi.hoisted` so the mock factory,
// which is hoisted above the imports, can close over it.
const virtualConfig = vi.hoisted(() => {
    return {} as { raw?: unknown };
});

vi.mock('virtual:astromech/config', () => ({
    get rawConfig() {
        return virtualConfig.raw;
    },
}));

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    const raw = {
        ...makeTestConfig(),
        db: {
            type: 'test',
            getInstance: () => db,
            createDialect(): never {
                throw new Error('unused');
            },
            supportsTransactions: true,
        },
    };
    virtualConfig.raw = raw;

    // An uncreated application is exactly what a Cron Trigger hits: every slot
    // boot fills is empty, including the db `createTestDb` just set.
    delete globalThis.__astromech?.db;
    delete globalThis.__astromech?.config;
    delete globalThis.__astromech?.application;
    delete globalThis.__astromech?.cronJobs;
    delete globalThis.__astromech?.scheduler;
    delete globalThis.__astromech?.defaultScheduler;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
    globals().cronInterval = undefined;
});

afterEach(() => {
    interval().stop?.();
    delete globalThis.__astromech?.application;
    delete globalThis.__astromech?.cronJobs;
    delete globalThis.__astromech?.scheduler;
    delete globalThis.__astromech?.defaultScheduler;
    globals().cronTickRunning = false;
    globals().cronUnscheduledWarned = new Set<string>();
    globals().cronInterval = undefined;
});

/** A stand-in for the Astro adapter's worker entry. */
function astroEntry(): { fetch: () => Response } {
    return { fetch: () => new Response('astro') };
}

describe('createWorkerEntry().scheduled on an uncreated application', () => {
    it('creates the application instead of throwing for the unset db', async () => {
        await expect(
            createWorkerEntry(astroEntry()).scheduled({
                scheduledTime: Date.parse('2024-06-01T12:00:00.000Z'),
            })
        ).resolves.toBeUndefined();

        const { getDb } = await import('@/database/registry');
        expect(getDb()).toBe(db);
    });

    it('runs a due job on the first scheduled tick', async () => {
        let ran = false;
        registerCronJob({
            name: 'boot-test-job',
            schedule: '* * * * *',
            handler: async () => {
                ran = true;
            },
        });

        const seedTime = new Date('2024-06-01T12:00:00.000Z');

        // First tick creates the application and seeds the table; nextRun lands
        // after seedTime.
        const worker = createWorkerEntry(astroEntry());
        await worker.scheduled({ scheduledTime: seedTime.getTime() });
        expect(ran).toBe(false);

        await db
            .updateTable('_astromech_cron')
            .set(
                encodePatchWith(cronTable, {
                    nextRun: new Date(seedTime.getTime() - 60_000),
                    lock: null,
                }) as unknown as Updateable<DB['_astromech_cron']>
            )
            .where('name', '=', 'boot-test-job')
            .execute();

        await worker.scheduled({ scheduledTime: seedTime.getTime() });
        expect(ran).toBe(true);
    });
});
