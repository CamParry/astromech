/**
 * Maintenance storage — cross-type, whole-table upkeep used by the built-in
 * entry CRON jobs (scheduled-publish, trash-purge). These operate over every
 * entry regardless of type, so they sit outside the per-type storage contract;
 * keeping their queries here preserves the "no raw DB in jobs" boundary.
 */

import type { Updateable } from 'kysely';
import { getDb } from '@/database/registry.js';
import { encodePatch } from '@/database/codec.js';
import type { DB, Db } from '@/database/types.js';

export type EntryMaintenanceStorage = ReturnType<typeof createEntryMaintenanceStorage>;

export function createEntryMaintenanceStorage(db: Db = getDb()) {
    /** Transition every scheduled entry whose publish time has passed to published. */
    async function publishDueScheduled(now: Date): Promise<void> {
        const nowSeconds = Math.floor(now.getTime() / 1000);
        const due = await db
            .selectFrom('entries')
            .select('id')
            .where((eb) =>
                eb.and([
                    eb('status', '=', 'scheduled'),
                    eb('publishedAt', '<=', nowSeconds),
                    eb('deletedAt', 'is', null),
                ])
            )
            .execute();

        if (due.length === 0) return;

        for (const { id } of due) {
            await db
                .updateTable('entries')
                .set(
                    encodePatch('entries', {
                        status: 'published',
                        updatedAt: new Date(),
                    }) as unknown as Updateable<DB['entries']>
                )
                .where('id', '=', id)
                .execute();
        }
    }

    /** Hard-delete every trashed entry deleted on or before `cutoff`. */
    async function purgeTrashedBefore(cutoff: Date): Promise<void> {
        const cutoffSeconds = Math.floor(cutoff.getTime() / 1000);
        await db
            .deleteFrom('entries')
            .where((eb) =>
                eb.and([
                    eb('deletedAt', 'is not', null),
                    eb('deletedAt', '<=', cutoffSeconds),
                ])
            )
            .execute();
    }

    return { publishDueScheduled, purgeTrashedBefore };
}
