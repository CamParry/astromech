/**
 * Cron repository: the only place Kysely touches the `_astromech_cron`
 * table. Every method goes through `createRepository(cronTable)`: the
 * scheduler's due/claim predicates are ORs the `where` DSL now expresses.
 */
import type { CronRow } from '@/database/tables';
import { createRepository } from '@/database/repository/create-repository';
import { cronTable } from '@/database/tables';

export type CronRepository = ReturnType<typeof createCronRepository>;

function createCronRepository() {
    const repository = createRepository(cronTable);

    /**
     * Store a job's schedule from config: insert its row, or, when the stored
     * schedule differs, replace the schedule and its next run. The run state
     * (`enabled`, `lastRun`, `lock`) is kept.
     */
    async function syncJob(row: {
        name: string;
        schedule: string;
        nextRun: Date | null;
    }): Promise<void> {
        const { name, schedule, nextRun } = row;
        await repository.createMany([{ name, schedule, enabled: true, nextRun }], {
            onConflict: 'ignore',
        });
        await repository.updateMany(
            { name, schedule: { ne: schedule } },
            { schedule, nextRun }
        );
    }

    /** Enabled jobs whose next run has arrived, or was never computed. */
    async function due(now: Date): Promise<CronRow[]> {
        return repository.findMany({
            where: { enabled: true, or: [{ nextRun: { lte: now } }, { nextRun: null }] },
        });
    }

    /**
     * CAS-claim a job for this tick by writing `expiry` into `lock`, but only
     * if unlocked or the previous claim expired. `true` means this caller owns
     * the run — the cross-instance double-fire guard; a crashed claim auto-expires.
     */
    async function claim(name: string, now: Date, expiry: Date): Promise<boolean> {
        const claimed = await repository.updateMany(
            { name, or: [{ lock: null }, { lock: { lte: now } }] },
            { lock: expiry }
        );
        return claimed === 1;
    }

    /**
     * Record a completed run and release the claim, gated on the exact claim
     * token. If the lease expired and another instance re-claimed it, this
     * matches 0 rows and leaves the new owner's state untouched — closing the ABA window.
     */
    async function recordRunAndRelease(
        name: string,
        token: Date,
        run: Pick<CronRow, 'lastRun' | 'lastResult' | 'lastError' | 'nextRun'>
    ): Promise<void> {
        await repository.updateMany({ name, lock: token }, { ...run, lock: null });
    }

    return { syncJob, due, claim, recordRunAndRelease };
}

/** The cron repository. Stateless: the db handle resolves per call. */
export const cronRepository = createCronRepository();
