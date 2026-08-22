/**
 * Maintenance repository — cross-type, whole-table upkeep for the built-in entry
 * CRON jobs. These run over every entry regardless of type, so they sit outside
 * the per-type repository contract; keeping them here keeps raw DB out of jobs.
 */

import type { Db } from '@/database/types';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable } from '@/database/tables';

export type EntryMaintenanceRepository = ReturnType<
    typeof createEntryMaintenanceRepository
>;

export function createEntryMaintenanceRepository(db: Db = getDb()) {
    const repository = createRepository(entriesTable, db);

    /**
     * Transition every scheduled entry whose publish time has passed to
     * published. Returns the number of entries transitioned.
     */
    async function publishDueScheduled(now: Date): Promise<number> {
        return repository.updateMany(
            { status: 'scheduled', publishedAt: { lte: now }, deletedAt: null },
            { status: 'published' }
        );
    }

    /**
     * Hard-delete every trashed entry deleted on or before `cutoff`. Returns the
     * purged ids so the caller can clean up what has no FK to cascade on. SQL
     * `deletedAt <= cutoff` is already false for NULL, so no guard is needed.
     */
    async function purgeTrashedBefore(cutoff: Date): Promise<string[]> {
        const where = { deletedAt: { lte: cutoff } };
        const doomed = await repository.findMany({ where });
        if (doomed.length === 0) return [];
        await repository.deleteMany(where);
        return doomed.map((row) => row.id);
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
