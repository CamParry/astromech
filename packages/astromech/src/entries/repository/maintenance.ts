/**
 * Maintenance repository — cross-type, whole-table upkeep for the built-in entry
 * CRON jobs. These run over every entry regardless of type, so they sit outside
 * the per-type repository contract; keeping them here keeps raw DB out of jobs.
 */

import type { Db } from '@/database/types';
import { encodePatchWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable, entryContentTable } from '@/database/tables';

export type EntryMaintenanceRepository = ReturnType<
    typeof createEntryMaintenanceRepository
>;

export function createEntryMaintenanceRepository(db: Db = getDb()) {
    const entries = createRepository(entriesTable, db);

    /**
     * Transition every scheduled content row whose publish time has passed to
     * published. Returns the number of rows transitioned.
     */
    async function publishDueScheduled(now: Date): Promise<number> {
        // Raw: the trash filter lives on the entry row, which the `where` DSL
        // cannot reach from `entry_content`.
        const result = await db
            .updateTable('entryContent')
            .set(encodePatchWith(entryContentTable, { status: 'published' }))
            .where((eb) =>
                eb.and([
                    eb('status', '=', 'scheduled'),
                    eb('publishedAt', '<=', now.toISOString()),
                    eb(
                        'entryId',
                        'in',
                        eb
                            .selectFrom('entries')
                            .select('entries.id')
                            .where('entries.deletedAt', 'is', null)
                    ),
                ])
            )
            .executeTakeFirst();
        return Number(result.numUpdatedRows);
    }

    /**
     * Hard-delete every trashed entry deleted on or before `cutoff`. Content
     * rows and versions cascade. Returns the purged entry ids so the caller can
     * clean up what has no FK to cascade on. SQL `deletedAt <= cutoff` is
     * already false for NULL, so no guard is needed.
     */
    async function purgeTrashedBefore(cutoff: Date): Promise<string[]> {
        const where = { deletedAt: { lte: cutoff } };
        const doomed = await entries.pluck('id', { where });
        if (doomed.length === 0) return [];
        await entries.deleteMany(where);
        return doomed;
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
