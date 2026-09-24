/**
 * Existence checks for the three targetable resources (entry, user, media), so
 * any module can ask without importing a peer service. Answers only "does this
 * row exist": no visibility, no shaping.
 */

import type { Db } from '@/database/types';
import type { TargetKind } from '@/types/domain';
import { chunks } from '@/database/chunks';
import { getDb } from '@/database/registry';
import { createLazyRegistry } from '@/registry';

export type ResourceExistenceRepository = ReturnType<
    typeof createResourceExistenceRepository
>;

function createResourceExistenceRepository() {
    /**
     * Which of these ids actually exist. Ids absent from the result do not.
     *
     * Entries include trashed and staged rows: a trashed entry still exists, and
     * neither state may make a reference to it read as dangling.
     */
    async function findIds(kind: TargetKind, ids: string[]): Promise<Set<string>> {
        const db = getDb();
        const found = new Set<string>();
        for (const chunk of chunks(ids)) {
            for (const id of await selectIds(db, kind, chunk)) {
                found.add(id);
            }
        }
        return found;
    }

    /**
     * The entry type each of these ids resolves to, keyed by id. Ids absent from
     * the result have no row in the `entries` table (dangling, or held by a
     * repository override), and the caller decides what that means.
     */
    async function findEntryTypes(ids: string[]): Promise<Map<string, string>> {
        const db = getDb();
        const types = new Map<string, string>();
        for (const chunk of chunks(ids)) {
            const rows = await db
                .selectFrom('entries')
                .select(['id', 'type'])
                .where('id', 'in', chunk)
                .execute();
            for (const row of rows) types.set(row.id, row.type);
        }
        return types;
    }

    return { findIds, findEntryTypes };
}

/** One `WHERE id IN (…)` against the table that owns `kind`. */
async function selectIds(db: Db, kind: TargetKind, ids: string[]): Promise<string[]> {
    switch (kind) {
        case 'entry': {
            const rows = await db
                .selectFrom('entries')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
        case 'user': {
            const rows = await db
                .selectFrom('users')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
        case 'media': {
            const rows = await db
                .selectFrom('media')
                .select('id')
                .where('id', 'in', ids)
                .execute();
            return rows.map((row) => row.id);
        }
    }
}

const resourceExistenceRepository = createLazyRegistry<ResourceExistenceRepository>(
    'resourceExistenceRepository',
    createResourceExistenceRepository
);

/** The resource existence repository, built on first use. */
export function getResourceExistenceRepository(): ResourceExistenceRepository {
    return resourceExistenceRepository.get();
}

/**
 * Swap the resource existence repository, so a test can replace one method.
 * @internal
 */
export function setResourceExistenceRepository(
    repository: ResourceExistenceRepository
): void {
    resourceExistenceRepository.set(repository);
}
