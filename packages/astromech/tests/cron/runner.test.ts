/**
 * The cron due-evaluator, `onTick` and `runDue`, on a real `_astromech_cron`
 * table. A test puts a job's row in the state it needs with `setCronRow` and
 * reads it back with `cronRow`; the table has no read path of its own.
 */

import type { CronRow } from '@/database/tables';
import {
    createTestDb,
    makeTestConfig,
    resetRuntime,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { registerCronJob } from '@/cron/registry';
import { onTick, runDue } from '@/cron/runner';
import { decodeWith, encodePatchWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { cronTable } from '@/database/tables';

/** The instant every tick below runs at, unless a test names another. */
const NOW = new Date('2024-06-01T12:00:00.000Z');
/** A tick an hour earlier, which seeds a job's row without making it due. */
const SEED = new Date('2024-06-01T11:00:00.000Z');
const MINUTE_AGO = new Date('2024-06-01T11:59:00.000Z');
const MINUTE_ON = new Date('2024-06-01T12:01:00.000Z');

/** Register `name` on `schedule`, and answer how many times it has run. */
function countedJob(name: string, schedule = '* * * * *'): { runs: number } {
    const counter = { runs: 0 };
    registerCronJob({
        name,
        schedule,
        handler: async () => {
            counter.runs += 1;
        },
    });
    return counter;
}

/** Write `patch` over the stored row of the job `name`. */
async function setCronRow(name: string, patch: Partial<CronRow>): Promise<void> {
    await getDb()
        .updateTable('_astromech_cron')
        .set(encodePatchWith(cronTable, patch))
        .where('name', '=', name)
        .execute();
}

/** The stored row of the job `name`, or undefined when it has none. */
async function cronRow(name: string): Promise<CronRow | undefined> {
    const row = await getDb()
        .selectFrom('_astromech_cron')
        .selectAll()
        .where('name', '=', name)
        .executeTakeFirst();
    return row === undefined ? undefined : decodeWith(cronTable, row);
}

/** Every stored job name. */
async function cronNames(): Promise<string[]> {
    const rows = await getDb().selectFrom('_astromech_cron').select('name').execute();
    return rows.map((row) => row.name);
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('seeding', () => {
    it('stores a registered job once, enabled, due at its next minute', async () => {
        countedJob('test-job');

        await onTick(new Date('2024-06-01T00:00:00.000Z'), systemAppContext());
        await onTick(new Date('2024-06-01T00:00:30.000Z'), systemAppContext());

        expect(await cronNames()).toEqual(['test-job']);
        expect(await cronRow('test-job')).toMatchObject({
            enabled: true,
            schedule: '* * * * *',
            nextRun: new Date('2024-06-01T00:01:00.000Z'),
        });
    });

    it('keeps a schedule edited after seeding', async () => {
        countedJob('test-job');
        await onTick(new Date('2024-06-01T00:00:00.000Z'), systemAppContext());
        await setCronRow('test-job', { schedule: '0 12 * * *' });

        await onTick(new Date('2024-06-01T00:02:00.000Z'), systemAppContext());

        expect((await cronRow('test-job'))?.schedule).toBe('0 12 * * *');
    });
});

describe('due evaluation', () => {
    it.each<{ name: string; patch: Partial<CronRow>; runs: number }>([
        { name: 'runs a job whose nextRun has passed', patch: {}, runs: 1 },
        {
            name: 'skips a job whose nextRun is to come',
            patch: { nextRun: MINUTE_ON },
            runs: 0,
        },
        { name: 'skips a disabled job', patch: { enabled: false }, runs: 0 },
        {
            name: 'reclaims a job whose claim has expired',
            patch: { lock: MINUTE_AGO },
            runs: 1,
        },
    ])('$name', async ({ patch, runs }) => {
        const job = countedJob('test-job');
        await onTick(SEED, systemAppContext());
        await setCronRow('test-job', { nextRun: MINUTE_AGO, lock: null, ...patch });

        await onTick(NOW, systemAppContext());

        expect(job.runs).toBe(runs);
    });

    it('runs a missed job once, with no backfill, and moves its nextRun on', async () => {
        const job = countedJob('test-job');
        await onTick(SEED, systemAppContext());
        await setCronRow('test-job', {
            nextRun: new Date('2024-01-01T00:00:00.000Z'),
            lock: null,
        });

        await onTick(NOW, systemAppContext());
        await onTick(NOW, systemAppContext());

        expect(job.runs).toBe(1);
        expect((await cronRow('test-job'))?.nextRun).toEqual(MINUTE_ON);
    });

    it('recomputes nextRun from a schedule edited since the last run', async () => {
        countedJob('test-job');
        await onTick(NOW, systemAppContext());
        await setCronRow('test-job', {
            schedule: '0 0 * * *',
            nextRun: MINUTE_AGO,
            lock: null,
        });

        await onTick(NOW, systemAppContext());

        expect((await cronRow('test-job'))?.nextRun).toEqual(
            new Date('2024-06-02T00:00:00.000Z')
        );
    });

    it('reads its schedule in the configured timezone', async () => {
        setupTestConfig({ ...makeTestConfig(), timezone: 'America/New_York' });
        countedJob('test-job', '0 0 * * *');

        await onTick(NOW, systemAppContext());

        // Midnight in New York (UTC-4 in June), not midnight UTC.
        expect((await cronRow('test-job'))?.nextRun).toEqual(
            new Date('2024-06-02T04:00:00.000Z')
        );
    });
});

describe('claims', () => {
    it('fires a due job once across two concurrent passes', async () => {
        const job = countedJob('test-job');
        await runDue(SEED, systemAppContext());
        await setCronRow('test-job', { nextRun: MINUTE_AGO, lock: null });

        await Promise.all([
            runDue(NOW, systemAppContext()),
            runDue(NOW, systemAppContext()),
        ]);

        expect(job.runs).toBe(1);
    });

    it('records nothing for a job whose claim another tick holds', async () => {
        const job = countedJob('test-job');
        await runDue(SEED, systemAppContext());
        await setCronRow('test-job', { nextRun: MINUTE_AGO, lock: MINUTE_ON });

        await runDue(NOW, systemAppContext());

        expect(job.runs).toBe(0);
        expect(await cronRow('test-job')).toMatchObject({
            nextRun: MINUTE_AGO,
            lock: MINUTE_ON,
            lastRun: null,
        });
    });

    it('skips a whole tick while an earlier one is still running', async () => {
        let release = (): void => undefined;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        let started = (): void => undefined;
        const running = new Promise<void>((resolve) => {
            started = resolve;
        });
        registerCronJob({
            name: 'slow-job',
            schedule: '* * * * *',
            handler: async () => {
                started();
                await released;
            },
        });
        await onTick(SEED, systemAppContext());
        await setCronRow('slow-job', { nextRun: MINUTE_AGO, lock: null });

        const first = onTick(NOW, systemAppContext());
        await running;
        // A job the second tick would seed, were it not skipped.
        countedJob('late-job');
        await onTick(NOW, systemAppContext());
        const seededWhileRunning = await cronRow('late-job');
        release();
        await first;

        expect(seededWhileRunning).toBeUndefined();
    });
});

describe('a failing job', () => {
    it('logs the failure, and still releases its claim and moves nextRun on', async () => {
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
        await runDue(SEED, systemAppContext());
        await setCronRow('test-job', { nextRun: MINUTE_AGO, lock: null });

        await expect(onTick(NOW, systemAppContext())).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('test-job'),
            expect.any(Error)
        );
        expect(await cronRow('test-job')).toMatchObject({
            lock: null,
            nextRun: MINUTE_ON,
        });
    });
});

// The runner reads the resolved config from the config registry boot fills,
// never from `virtual:astromech/config`, which a plain-Node tick cannot import.
describe('the config source', () => {
    it('throws a clear error when the config registry is unset', async () => {
        resetRuntime();
        countedJob('test-job');

        await expect(
            runDue(new Date('2024-06-01T00:00:00.000Z'), systemAppContext())
        ).rejects.toThrow(/'config' is not configured\. Ensure createAstromech/);
    });
});
