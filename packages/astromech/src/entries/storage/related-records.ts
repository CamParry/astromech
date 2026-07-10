/**
 * Related-record storage — batch-loads relationship *targets* (entry / user
 * rows) by id for the populate orchestration. Keeps the raw row reads in the
 * storage seam; `internal/populate.ts` only orchestrates.
 */

import { getDb } from '@/database/registry.js';
import { decode } from '@/database/codec.js';
import type { Db } from '@/database/types.js';

export type RelatedRecordStorage = ReturnType<typeof createRelatedRecordStorage>;

export function createRelatedRecordStorage(db: Db = getDb()) {
    /** Map of id → entry row for the given ids (empty for an empty input). */
    async function entriesByIds(ids: string[]): Promise<Record<string, unknown>> {
        const map: Record<string, unknown> = {};
        if (ids.length === 0) return map;
        const rows = await db
            .selectFrom('entries')
            .selectAll()
            .where('id', 'in', ids)
            .execute();
        for (const row of rows) {
            map[row.id] = decode('entries', row);
        }
        return map;
    }

    /** Map of id → user row for the given ids (empty for an empty input). */
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
