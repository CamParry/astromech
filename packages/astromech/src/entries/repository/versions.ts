/**
 * Version storage — CRUD for entry version-history snapshots. Wrapped by the
 * built-in entry storage's `versions` capability group.
 */

import type { EntryVersionRow, NewEntryVersionRow } from '../tables';
import type { Db } from '@/database/types';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entryVersionsTable } from '@/database/tables';

export type VersionRepository = ReturnType<typeof createVersionRepository>;

export function createVersionRepository(db?: Db) {
    const database = db ?? getDb();
    const repository = createRepository(entryVersionsTable, database);

    /** Create a new version snapshot. */
    async function create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        return repository.create(data);
    }

    /** Get all versions for an entry, newest first. */
    async function list(entryId: string): Promise<EntryVersionRow[]> {
        return repository.findMany({
            where: { entryId },
            orderBy: [['versionNumber', 'desc']],
        });
    }

    /** Get a single version by ID. */
    async function get(id: string): Promise<EntryVersionRow | null> {
        return repository.findOne({ id });
    }

    /** Get the highest version number for an entry (0 if no versions exist). */
    async function getLatestNumber(entryId: string): Promise<number> {
        const { db: handle, table } = repository.query();
        const row = await handle
            .selectFrom(table)
            .select((eb) => eb.fn.max('versionNumber').as('m'))
            .where('entryId', '=', entryId)
            .executeTakeFirst();
        return Number(row?.m ?? 0);
    }

    /** Delete oldest versions beyond a retention limit (for CRON trimming). */
    async function deleteExcess(entryId: string, keep: number): Promise<void> {
        const excess = await repository.findMany({
            where: { entryId },
            orderBy: [['versionNumber', 'desc']],
            offset: keep,
        });
        if (excess.length === 0) return;
        await repository.deleteMany({ id: { in: excess.map((v) => v.id) } });
    }

    return { create, list, get, getLatestNumber, deleteExcess };
}
