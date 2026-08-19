/**
 * Version storage — CRUD for entry version-history snapshots. Wrapped by the
 * built-in entry storage's `versions` capability group.
 */

import type { EntryVersionRow, NewEntryVersionRow } from '../schema';
import type { Db } from '@/database/types';
import { getDb } from '@/database/registry';
import { entryVersionsTable } from '@/database/schema';
import { createStorage } from '@/database/storage/create-storage';

export type VersionStorage = ReturnType<typeof createVersionStorage>;

export function createVersionStorage(db: Db = getDb()) {
    const storage = createStorage(entryVersionsTable, db);

    /** Create a new version snapshot. */
    async function create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        return storage.create(data);
    }

    /** Get all versions for an entry, newest first. */
    async function list(entryId: string): Promise<EntryVersionRow[]> {
        return storage.findMany({
            where: { entryId },
            orderBy: [['versionNumber', 'desc']],
        });
    }

    /** Get a single version by ID. */
    async function get(id: string): Promise<EntryVersionRow | null> {
        return storage.findOne({ id });
    }

    /** Get the highest version number for an entry (0 if no versions exist). */
    async function getLatestNumber(entryId: string): Promise<number> {
        const { db: handle, table } = storage.query();
        const row = await handle
            .selectFrom(table)
            .select((eb) => eb.fn.max('versionNumber').as('m'))
            .where('entryId', '=', entryId)
            .executeTakeFirst();
        return Number(row?.m ?? 0);
    }

    /** Delete oldest versions beyond a retention limit (for CRON trimming). */
    async function deleteExcess(entryId: string, keep: number): Promise<void> {
        const excess = await storage.findMany({
            where: { entryId },
            orderBy: [['versionNumber', 'desc']],
            offset: keep,
        });
        if (excess.length === 0) return;
        await storage.deleteMany({ id: { in: excess.map((v) => v.id) } });
    }

    return { create, list, get, getLatestNumber, deleteExcess };
}
