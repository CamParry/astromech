/**
 * The shared versions group — CRUD for a resource's version-history snapshots,
 * keyed on the content row a version snapshots. Parameterized over the
 * versions table, so entries and globals share one implementation.
 */

import type { ContentRowId, ContentVersions, NewVersionSnapshot } from './types';
import type { Table, TableSelect } from '@/database/define-table';
import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';

export function createVersionsRepository<V extends Table>(
    table: V,
    db?: Db
): ContentVersions<TableSelect<V>> {
    // Pass `db` straight through: `createRepository`'s `handle()` resolves
    // `db ?? getDb()` per call, so a repository built before `transaction()`
    // opens still binds to the open scope (`DECISIONS.md`).
    const repository = createRepository(table, db);

    /** Every version of a content row, newest first. */
    async function list(contentId: ContentRowId): Promise<TableSelect<V>[]> {
        return repository.findMany({
            where: { contentId } as never,
            orderBy: [['version', 'desc']] as never,
        });
    }

    async function get(id: string): Promise<TableSelect<V> | null> {
        return repository.findOne({ id } as never);
    }

    /** Write one snapshot. A resource's own snapshot columns pass through. */
    async function create(snapshot: NewVersionSnapshot): Promise<void> {
        await repository.create(snapshot as never);
    }

    /**
     * The highest version number for a content row (0 if none exist). On the raw
     * handle because `max()` is an aggregate, which the `where` DSL does not reach.
     */
    async function latestNumber(contentId: ContentRowId): Promise<number> {
        const { db: handle, table: tableKey } = repository.kysely();
        const row = await handle
            .selectFrom(tableKey)
            .select((eb) => eb.fn.max('version').as('m'))
            .where('contentId', '=', contentId)
            .executeTakeFirst();
        return Number(row?.m ?? 0);
    }

    return { list, get, create, latestNumber };
}
