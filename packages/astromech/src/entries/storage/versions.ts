/**
 * Version storage — CRUD for entry version-history snapshots. Wrapped by the
 * built-in entry storage's `versions` capability group.
 */

import { eq, desc, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
    entryVersionsTable,
    type EntryVersionRow,
    type NewEntryVersionRow,
} from '../schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

export type VersionStorage = ReturnType<typeof createVersionStorage>;

export function createVersionStorage(db: Db) {
    /** Create a new version snapshot. */
    async function create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        const result = await db.insert(entryVersionsTable).values(data).returning();
        const row = result[0];
        if (!row) throw new Error('Insert returned no rows');
        return row;
    }

    /** Get all versions for an entry, newest first. */
    async function list(entryId: string): Promise<EntryVersionRow[]> {
        return db
            .select()
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.entryId, entryId))
            .orderBy(desc(entryVersionsTable.versionNumber));
    }

    /** Get a single version by ID. */
    async function get(id: string): Promise<EntryVersionRow | null> {
        const result = await db
            .select()
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.id, id))
            .limit(1);
        return result[0] ?? null;
    }

    /** Get the highest version number for an entry (0 if no versions exist). */
    async function getLatestNumber(entryId: string): Promise<number> {
        const result = await db
            .select({ max: sql<number>`max(${entryVersionsTable.versionNumber})` })
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.entryId, entryId));
        return result[0]?.max ?? 0;
    }

    /** Delete oldest versions beyond a retention limit (for CRON trimming). */
    async function deleteExcess(entryId: string, keep: number): Promise<void> {
        const versions = await list(entryId);
        const toDelete = versions.slice(keep);
        for (const version of toDelete) {
            await db
                .delete(entryVersionsTable)
                .where(eq(entryVersionsTable.id, version.id));
        }
    }

    return { create, list, get, getLatestNumber, deleteExcess };
}
