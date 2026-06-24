/**
 * Related-record storage — batch-loads relationship *targets* (entry / user
 * rows) by id for the populate orchestration. Keeps the raw row reads in the
 * storage seam; `internal/populate.ts` only orchestrates.
 */

import { inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDb } from '@/database/registry.js';
import { entriesTable } from '../schema.js';
// usersTable via the @/database/schema aggregate (not @/users/schema) to avoid an
// entries→users domain peer import; the aggregator re-exports every domain's tables.
import { usersTable } from '@/database/schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

export type RelatedRecordStorage = ReturnType<typeof createRelatedRecordStorage>;

export function createRelatedRecordStorage(db: Db = getDb()) {
    /** Map of id → entry row for the given ids (empty for an empty input). */
    async function entriesByIds(ids: string[]): Promise<Record<string, unknown>> {
        const map: Record<string, unknown> = {};
        if (ids.length === 0) return map;
        const rows = await db
            .select()
            .from(entriesTable)
            .where(inArray(entriesTable.id, ids));
        for (const row of rows) map[row.id] = row;
        return map;
    }

    /** Map of id → user row for the given ids (empty for an empty input). */
    async function usersByIds(ids: string[]): Promise<Record<string, unknown>> {
        const map: Record<string, unknown> = {};
        if (ids.length === 0) return map;
        const rows = await db
            .select()
            .from(usersTable)
            .where(inArray(usersTable.id, ids));
        for (const row of rows) map[row.id] = row;
        return map;
    }

    return { entriesByIds, usersByIds };
}
