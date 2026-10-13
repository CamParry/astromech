/**
 * A Cron Trigger fires `scheduled()`, never `fetch()`, so the worker entry's
 * scheduled handler is reached with nothing booted. Its own file because it
 * feeds a raw config through the real boot, where the rest of the suite
 * publishes a resolved config through the harness.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig } from '@/types/index';
import type { Kysely } from 'kysely';
import { expectConsole } from '@tests/console';
import { createTestDb, makeBootConfig, resetRuntime } from '@tests/harness';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interval } from '@/cron/drivers/interval';
import { registerCronJob } from '@/cron/registry';
import { encodePatchWith } from '@/database/codec';
import { cronTable } from '@/database/tables';
import { createWorkerEntry } from '@/integrations/cloudflare/worker';

let db: Kysely<DB>;

/** The site config the worker entry is built with, rebuilt per test. */
let config: AstromechConfig;

beforeEach(async () => {
    db = await createTestDb();
    config = makeBootConfig();

    // An uncreated application is exactly what a Cron Trigger hits: every slot
    // boot fills is empty, including the db `createTestDb` just set.
    resetRuntime();
});

afterEach(() => {
    interval().stop?.();
    vi.unstubAllGlobals();
});

/** A stand-in for the Astro adapter's worker entry. */
function astroEntry(): { fetch: () => Response } {
    return { fetch: () => new Response('astro') };
}

/** The worker entry under test, built with the config this file assembled. */
function worker() {
    return createWorkerEntry(astroEntry(), { config });
}

describe('createWorkerEntry().scheduled on an uncreated application', () => {
    it('creates the application instead of throwing for the unset db', async () => {
        await expect(
            worker().scheduled(
                { scheduledTime: Date.parse('2024-06-01T12:00:00.000Z') },
                {}
            )
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
        const entry = worker();
        await entry.scheduled({ scheduledTime: seedTime.getTime() }, {});
        expect(ran).toBe(false);

        await db
            .updateTable('_astromech_cron')
            .set(
                encodePatchWith(cronTable, {
                    nextRun: new Date(seedTime.getTime() - 60_000),
                    lock: null,
                })
            )
            .where('name', '=', 'boot-test-job')
            .execute();

        await entry.scheduled({ scheduledTime: seedTime.getTime() }, {});
        expect(ran).toBe(true);
    });

    // A Worker has no file system to read the migrations folder from, and a
    // Worker woken only by a Cron Trigger has served no request.
    it('checks the database against the migration names bundled at build time', async () => {
        const { rows } = await sql<{
            name: string;
        }>`SELECT name FROM kysely_migration`.execute(db);
        vi.stubGlobal('__ASTROMECH_MIGRATION_NAMES__', [
            ...rows.map((row) => row.name),
            '9999_not-applied',
        ]);
        expectConsole(
            'error',
            '1 migration has not been applied to this database: 9999_not-applied'
        );

        await expect(
            worker().scheduled(
                { scheduledTime: Date.parse('2024-06-01T12:00:00.000Z') },
                {}
            )
        ).resolves.toBeUndefined();
    });
});
