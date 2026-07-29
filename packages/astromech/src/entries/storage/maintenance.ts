/**
 * Maintenance storage — cross-type, whole-table upkeep used by the built-in
 * entry CRON jobs (scheduled-publish, trash-purge). These operate over every
 * entry regardless of type, so they sit outside the per-type storage contract;
 * keeping their queries here preserves the "no raw DB in jobs" boundary.
 *
 * Both operations are single batch statements on `createStorage`'s
 * `updateMany`/`deleteMany` — the wrapper owns value serialization (a `Date`
 * passed to `where` is compared as ISO-TEXT) and the `updatedAt` stamp.
 */

import { getDb } from '@/database/registry.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { entries } from '@/database/schema.js';
import type { Db } from '@/database/types.js';

export type EntryMaintenanceStorage = ReturnType<typeof createEntryMaintenanceStorage>;

export function createEntryMaintenanceStorage(db: Db = getDb()) {
    const storage = createStorage(entries, db);

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
     * Hard-delete every trashed entry deleted on or before `cutoff`. Returns
     * the number of entries deleted.
     *
     * No explicit `deletedAt IS NOT NULL` guard is needed — SQL `deletedAt <=
     * cutoff` is already false for a NULL `deletedAt`.
     */
    async function purgeTrashedBefore(cutoff: Date): Promise<number> {
        return storage.deleteMany({ deletedAt: { lte: cutoff } });
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
