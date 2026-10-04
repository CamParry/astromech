/**
 * The shared versions group — CRUD for a resource's version-history snapshots,
 * keyed on the content row a version snapshots. Parameterized over the
 * versions table, so entries and globals share one implementation.
 */

import type {
    ContentRowId,
    ContentVersions,
    NewVersionSnapshot,
    VersionMetadataRow,
} from './types';
import type { Table, TableSelect } from '@/database/define-table';
import type { Db } from '@/database/types';
import { decodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';

/**
 * The versions group without `snapshot`, which reads the content table and so
 * belongs to the content repository.
 */
export function createVersionsRepository<V extends Table>(
    table: V,
    db?: Db
): Omit<ContentVersions<TableSelect<V>>, 'snapshot'> {
    // Pass `db` straight through: `createRepository`'s `handle()` resolves
    // `db ?? getDb()` per call, so a repository built before `transaction()`
    // opens still binds to the open scope (`DECISIONS.md`).
    const repository = createRepository(table, db);

    /**
     * Every version of a content row, newest first. A list shows no content, so
     * only the metadata columns are read and decoded.
     */
    async function findMany(contentId: ContentRowId): Promise<VersionMetadataRow[]> {
        const { db: handle, table: tableKey } = repository.kysely();
        const rows = await handle
            .selectFrom(tableKey)
            .select(['version', 'createdAt', 'createdBy'])
            .where('contentId', '=', contentId)
            .orderBy('version', 'desc')
            .execute();
        // `decodeWith` skips absent columns, so a three-column row decodes fine.
        return rows.map((row) => {
            const decoded = decodeWith(table, row) as Record<string, unknown>;
            return {
                version: decoded['version'] as number,
                createdAt: decoded['createdAt'] as Date,
                createdBy: (decoded['createdBy'] ?? null) as string | null,
            };
        });
    }

    async function findOne(
        contentId: ContentRowId,
        version: number
    ): Promise<TableSelect<V> | null> {
        return repository.findOne({ contentId, version });
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

    return { findMany, findOne, create, latestNumber };
}
