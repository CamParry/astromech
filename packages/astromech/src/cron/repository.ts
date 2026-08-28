/**
 * Cron repository — the only place Kysely touches the `_astromech_cron`
 * table. Every method goes through `createRepository(cronTable)`: the
 * scheduler's due/claim predicates are ORs the `where` DSL now expresses.
 */
import type { CronRow, NewCronRow } from '@/database/tables';
import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import { cronTable } from '@/database/tables';

export type CronRepository = ReturnType<typeof createCronRepository>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createCronRepository(db?: Db) {
    const repository = createRepository(cronTable, db);

    /**
     * Insert a job's seed row, or leave an existing one alone. ON CONFLICT DO
     * NOTHING rather than an upsert: a stored (possibly admin-edited) row is
     * authoritative and must never be overwritten by the registry's defaults.
     */
    async function seedJob(row: NewCronRow): Promise<void> {
        await repository.createMany([row], { onConflict: 'ignore' });
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
        run: { lastRun: Date; nextRun: Date | null }
    ): Promise<void> {
        await repository.updateMany({ name, lock: token }, { ...run, lock: null });
    }

    return { seedJob, due, claim, recordRunAndRelease };
}
