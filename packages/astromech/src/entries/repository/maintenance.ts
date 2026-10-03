/**
 * Maintenance repository: cross-type, whole-table upkeep for the built-in entry
 * CRON jobs. These run over every entry regardless of type, so they sit outside
 * the per-type repository contract; keeping them here keeps raw DB out of jobs.
 */

import { decodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable, entryContentTable } from '@/database/tables';
import { compareTimestamps } from '@/database/timestamps';

/** One locale of one entry, as `findDueScheduled` names it, with its publish time. */
type DueScheduledEntry = {
    type: string;
    id: string;
    locale: string;
    publishedAt: Date;
};

export type EntryMaintenanceRepository = ReturnType<
    typeof createEntryMaintenanceRepository
>;

function createEntryMaintenanceRepository() {
    const entries = createRepository(entriesTable);
    const contents = createRepository(entryContentTable);

    /**
     * Every canonical content row of a live entry that is scheduled and whose
     * publish time has passed, for the `scheduled-publish` job to publish.
     */
    async function findDueScheduled(now: Date): Promise<DueScheduledEntry[]> {
        const { db, table, where } = contents.kysely();
        const raw = await db
            .selectFrom(table)
            .selectAll()
            .where((eb) =>
                eb.and([
                    where({
                        status: 'scheduled',
                        // Canonical rows only: a staged change publishes at its merge.
                        stagedFor: null,
                        trashed: false,
                    })(eb),
                    compareTimestamps(`${table}.publishedAt`, '<=', now),
                ])
            )
            .execute();
        // A null date is never due; the check narrows the type.
        return raw.flatMap((row) => {
            const { type, entryId, locale, publishedAt } = decodeWith(
                entryContentTable,
                row
            );
            return publishedAt ? [{ type, id: entryId, locale, publishedAt }] : [];
        });
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

    return { findDueScheduled, purgeTrashedBefore };
}

/** The entry maintenance repository. Stateless: the db handle resolves per call. */
export const entryMaintenanceRepository = createEntryMaintenanceRepository();
