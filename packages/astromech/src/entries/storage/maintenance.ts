/**
 * Maintenance storage — cross-type, whole-table upkeep used by the built-in
 * entry CRON jobs (scheduled-publish, trash-purge). These operate over every
 * entry regardless of type, so they sit outside the per-type storage contract;
 * keeping their drizzle here preserves the "no raw DB in jobs" boundary.
 */

import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDb } from '@/database/registry.js';
import { entriesTable } from '../schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

export type EntryMaintenanceStorage = ReturnType<typeof createEntryMaintenanceStorage>;

export function createEntryMaintenanceStorage(db: Db = getDb()) {
    /** Transition every scheduled entry whose publish time has passed to published. */
    async function publishDueScheduled(now: Date): Promise<void> {
        const due = await db
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(
                and(
                    eq(entriesTable.status, 'scheduled'),
                    lte(entriesTable.publishedAt, now),
                    isNull(entriesTable.deletedAt)
                )
            );

        if (due.length === 0) return;

        for (const { id } of due) {
            await db
                .update(entriesTable)
                .set({ status: 'published', updatedAt: new Date() })
                .where(eq(entriesTable.id, id));
        }
    }

    /** Hard-delete every trashed entry deleted on or before `cutoff`. */
    async function purgeTrashedBefore(cutoff: Date): Promise<void> {
        await db
            .delete(entriesTable)
            .where(
                and(
                    isNotNull(entriesTable.deletedAt),
                    lte(entriesTable.deletedAt, cutoff)
                )
            );
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
