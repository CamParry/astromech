/**
 * Versions Repository
 * Handles CRUD operations for entry version history
 */

import { eq, desc, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { entryVersionsTable, type EntryVersionRow, type NewEntryVersionRow } from '@/db/schema';

export class VersionsRepository {
    constructor(private db: LibSQLDatabase) {}

    /**
     * Create a new version snapshot
     */
    async create(data: NewEntryVersionRow): Promise<EntryVersionRow> {
        const result = await this.db.insert(entryVersionsTable).values(data).returning();
        return result[0]!;
    }

    /**
     * Get all versions for an entry, newest first
     */
    async list(entryId: string): Promise<EntryVersionRow[]> {
        return this.db
            .select()
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.entryId, entryId))
            .orderBy(desc(entryVersionsTable.versionNumber));
    }

    /**
     * Get a single version by ID
     */
    async get(id: string): Promise<EntryVersionRow | null> {
        const result = await this.db
            .select()
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.id, id))
            .limit(1);
        return result[0] ?? null;
    }

    /**
     * Get the highest version number for an entry (0 if no versions exist)
     */
    async getLatestNumber(entryId: string): Promise<number> {
        const result = await this.db
            .select({ max: sql<number>`max(${entryVersionsTable.versionNumber})` })
            .from(entryVersionsTable)
            .where(eq(entryVersionsTable.entryId, entryId));
        return result[0]?.max ?? 0;
    }

    /**
     * Delete oldest versions beyond a retention limit (for CRON trimming)
     */
    async deleteExcess(entryId: string, keep: number): Promise<void> {
        const versions = await this.list(entryId);
        const toDelete = versions.slice(keep);
        for (const version of toDelete) {
            await this.db
                .delete(entryVersionsTable)
                .where(eq(entryVersionsTable.id, version.id));
        }
    }
}
