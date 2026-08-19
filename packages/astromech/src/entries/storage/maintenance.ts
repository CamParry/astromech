/**
 * Maintenance storage — cross-type, whole-table upkeep used by the built-in
 * entry CRON jobs (scheduled-publish, trash-purge). These operate over every
 * entry regardless of type, so they sit outside the per-type storage contract;
 * keeping their queries here preserves the "no raw DB in jobs" boundary.
 *
 * Both stay batch operations on `createStorage`'s `updateMany`/`deleteMany` —
 * the wrapper owns value serialization (a `Date` passed to `where` is compared
 * as ISO-TEXT) and the `updatedAt` stamp.
 */

import type { Db } from '@/database/types';
import { getDb } from '@/database/registry';
import { entriesTable } from '@/database/schema';
import { createStorage } from '@/database/storage/create-storage';

export type EntryMaintenanceStorage = ReturnType<typeof createEntryMaintenanceStorage>;

export function createEntryMaintenanceStorage(db: Db = getDb()) {
    const storage = createStorage(entriesTable, db);

    /**
     * Transition every scheduled entry whose publish time has passed to
     * published. Returns the number of entries transitioned.
     */
    async function publishDueScheduled(now: Date): Promise<number> {
        return storage.updateMany(
            { status: 'scheduled', publishedAt: { lte: now }, deletedAt: null },
            { status: 'published' }
        );
    }

    /**
     * Hard-delete every trashed entry deleted on or before `cutoff`. Returns the
     * purged ids so the caller can clean up what has no FK to cascade on.
     *
     * No explicit `deletedAt IS NOT NULL` guard is needed — SQL `deletedAt <=
     * cutoff` is already false for a NULL `deletedAt`.
     */
    async function purgeTrashedBefore(cutoff: Date): Promise<string[]> {
        const where = { deletedAt: { lte: cutoff } };
        const doomed = await storage.findMany({ where });
        if (doomed.length === 0) return [];
        await storage.deleteMany(where);
        return doomed.map((row) => row.id);
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
