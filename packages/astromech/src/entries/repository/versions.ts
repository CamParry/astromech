/**
 * Version repository — CRUD for entry version-history snapshots. Keyed on the
 * content row a version snapshots. Wrapped by the entries-table repository's
 * `versions` capability group.
 */

import type { EntryVersionRow, NewEntryVersionRow } from '../tables';
import type { ContentRowId } from './types';
import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import { entryVersionsTable } from '@/database/tables';

export type VersionRepository = ReturnType<typeof createVersionRepository>;

export function createVersionRepository(db?: Db) {
    // Pass `db` straight through: `createRepository`'s `handle()` resolves
    // `db ?? getDb()` per call, so a repository built before `transaction()`
    // opens still binds to the open scope (`DECISIONS.md`).
    const repository = createRepository(entryVersionsTable, db);

    /** Create a new version snapshot. */
    async function create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        return repository.create(data);
    }

    /** Get all versions of a content row, newest first. */
    async function list(contentId: ContentRowId): Promise<EntryVersionRow[]> {
        return repository.findMany({
            where: { contentId },
            orderBy: [['version', 'desc']],
        });
    }

    /** Get a single version by ID. */
    async function get(id: string): Promise<EntryVersionRow | null> {
        return repository.findOne({ id });
    }

    /**
     * Get the highest version number for a content row (0 if none exist).
     * On the raw handle because `max()` is an aggregate, which the `where`
     * DSL does not reach.
     */
    async function getLatestNumber(contentId: ContentRowId): Promise<number> {
        const { db: handle, table } = repository.kysely();
        const row = await handle
            .selectFrom(table)
            .select((eb) => eb.fn.max('version').as('m'))
            .where('contentId', '=', contentId)
            .executeTakeFirst();
        return Number(row?.m ?? 0);
    }

    return { create, list, get, getLatestNumber };
}
