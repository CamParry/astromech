/**
 * Related-record storage — batch-loads relationship *targets* (entry / user
 * rows) by id for the populate orchestration. Keeps the raw row reads in the
 * storage seam; `internal/populate.ts` only orchestrates.
 *
 * Entries are descriptor-backed, so that half goes through
 * `createStorage(entries)`. Users are a better-auth table with no `defineTable`
 * descriptor — see the comment at `usersByIds` for why it stays on the legacy
 * string-keyed codec.
 */

import { getDb } from '@/database/registry.js';
import { decode } from '@/database/codec.js';
import { createStorage } from '@/database/storage/create-storage.js';
import type { Db } from '@/database/types.js';
import { entries } from '../schema.js';

export type RelatedRecordStorage = ReturnType<typeof createRelatedRecordStorage>;

export function createRelatedRecordStorage(db: Db = getDb()) {
    const entryStorage = createStorage(entries, db);

    /** Map of id → entry row for the given ids (empty for an empty input). */
    async function entriesByIds(ids: string[]): Promise<Record<string, unknown>> {
        const map: Record<string, unknown> = {};
        if (ids.length === 0) return map;
        const rows = await entryStorage.findMany({ where: { id: { in: ids } } });
        for (const row of rows) {
            map[row.id] = row;
        }
        return map;
    }

    /**
     * Map of id → user row for the given ids (empty for an empty input).
     *
     * `users` is one of better-auth's own tables — it has no `defineTable`
     * descriptor, so it can't move onto `createStorage`. It stays on the raw
     * query plus the legacy string-keyed `decode('users', …)` codec path,
     * which is the format better-auth owns. Don't "finish the job" here.
     */
    async function usersByIds(ids: string[]): Promise<Record<string, unknown>> {
        const map: Record<string, unknown> = {};
        if (ids.length === 0) return map;
        const rows = await db
            .selectFrom('users')
            .selectAll()
            .where('id', 'in', ids)
            .execute();
        for (const row of rows) {
            map[row.id] = decode('users', row);
        }
        return map;
    }

    return { entriesByIds, usersByIds };
}
