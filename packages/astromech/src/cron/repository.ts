/**
 * Cron repository — the only place Kysely touches the `_astromech_cron`
 * table. Three of the four methods still drop to `query()`, because the
 * scheduler's due/claim predicates are ORs the flat `where` DSL can't express.
 */
import type { CronRow, NewCronRow } from '@/database/tables';
import type { Db } from '@/database/types';
import { decodeWith, encodePatchWith, encodeWith } from '@/database/codec';
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
        const { db: handle, table } = repository.query();
        await handle
            .insertInto(table)
            .values(encodeWith(cronTable, row))
            .onConflict((oc) => oc.doNothing())
            .execute();
    }

    /** Enabled jobs whose next run has arrived, or was never computed. */
    async function due(now: Date): Promise<CronRow[]> {
        const { db: handle, table, where } = repository.query();
        const rows = await handle
            .selectFrom(table)
            .selectAll()
            .where((eb) =>
                eb.and([
                    where({ enabled: true })(eb),
                    eb.or([
                        where({ nextRun: { lte: now } })(eb),
                        where({ nextRun: null })(eb),
                    ]),
                ])
            )
            .execute();
        return rows.map((row) => decodeWith(cronTable, row));
    }

    /**
     * CAS-claim a job for this tick by writing `expiry` into `lock`, but only
     * if unlocked or the previous claim expired. `true` means this caller owns
     * the run — the cross-instance double-fire guard; a crashed claim auto-expires.
     */
    async function claim(name: string, now: Date, expiry: Date): Promise<boolean> {
        const { db: handle, table, where } = repository.query();
        const result = await handle
            .updateTable(table)
            .set(encodePatchWith(cronTable, { lock: expiry }))
            .where((eb) =>
                eb.and([
                    where({ name })(eb),
                    eb.or([where({ lock: null })(eb), where({ lock: { lte: now } })(eb)]),
                ])
            )
            .executeTakeFirst();
        // Kysely types `numUpdatedRows` as a bigint. Comparing through `Number`
        // rather than against `1n` so a dialect that hands back a plain number
        // still elects a winner instead of silently never claiming anything.
        return Number(result.numUpdatedRows) === 1;
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
