/**
 * Relationship storage — shared cross-domain data access for entry/user/media
 * relationships. Composed by the services that own those resources (entries,
 * users, media). The only place drizzle touches the relationships table.
 */

import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDb } from '@/database/registry.js';
import {
    relationshipsTable,
    type RelationshipRow,
    type NewRelationshipRow,
} from '@/database/schema';
import type { ResourceType } from '@/types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

export type RelationshipStorage = ReturnType<typeof createRelationshipStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createRelationshipStorage(db: Db = getDb()) {
    /** Create a new relationship. */
    async function create(data: {
        sourceId: string;
        sourceType: ResourceType;
        name: string;
        targetId: string;
        targetType: ResourceType;
        position?: number;
    }): Promise<RelationshipRow> {
        const relationship: NewRelationshipRow = {
            sourceId: data.sourceId,
            sourceType: data.sourceType,
            name: data.name,
            targetId: data.targetId,
            targetType: data.targetType,
            position: data.position ?? 0,
        };

        const result = await db
            .insert(relationshipsTable)
            .values(relationship)
            .returning();
        const created = result[0];
        if (!created) {
            throw new Error('Failed to create relationship: insert returned no row');
        }
        return created;
    }

    /** Get all relationships for a source resource. */
    async function getBySource(
        sourceId: string,
        sourceType: ResourceType,
        name?: string
    ): Promise<RelationshipRow[]> {
        const conditions = [
            eq(relationshipsTable.sourceId, sourceId),
            eq(relationshipsTable.sourceType, sourceType),
        ];

        if (name) {
            conditions.push(eq(relationshipsTable.name, name));
        }

        return db
            .select()
            .from(relationshipsTable)
            .where(and(...conditions))
            .orderBy(relationshipsTable.position);
    }

    /** Get all relationships pointing to a target resource. */
    async function getByTarget(
        targetId: string,
        targetType: ResourceType
    ): Promise<RelationshipRow[]> {
        return db
            .select()
            .from(relationshipsTable)
            .where(
                and(
                    eq(relationshipsTable.targetId, targetId),
                    eq(relationshipsTable.targetType, targetType)
                )
            )
            .orderBy(relationshipsTable.position);
    }

    /** Update relationship positions (for ordered relations). */
    async function updatePositions(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        orderedTargetIds: string[]
    ): Promise<void> {
        for (let i = 0; i < orderedTargetIds.length; i++) {
            const targetId = orderedTargetIds[i];
            if (targetId === undefined) continue;
            await db
                .update(relationshipsTable)
                .set({ position: i })
                .where(
                    and(
                        eq(relationshipsTable.sourceId, sourceId),
                        eq(relationshipsTable.sourceType, sourceType),
                        eq(relationshipsTable.name, name),
                        eq(relationshipsTable.targetId, targetId)
                    )
                );
        }
    }

    /** Delete a specific relationship. */
    async function remove(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        targetId: string
    ): Promise<void> {
        await db
            .delete(relationshipsTable)
            .where(
                and(
                    eq(relationshipsTable.sourceId, sourceId),
                    eq(relationshipsTable.sourceType, sourceType),
                    eq(relationshipsTable.name, name),
                    eq(relationshipsTable.targetId, targetId)
                )
            );
    }

    /** Delete all relationships for a source. */
    async function deleteBySource(
        sourceId: string,
        sourceType: ResourceType,
        name?: string
    ): Promise<void> {
        const conditions = [
            eq(relationshipsTable.sourceId, sourceId),
            eq(relationshipsTable.sourceType, sourceType),
        ];

        if (name) {
            conditions.push(eq(relationshipsTable.name, name));
        }

        await db.delete(relationshipsTable).where(and(...conditions));
    }

    /**
     * Delete all relationships pointing to a target. Used for cascade delete or
     * cleaning up when a resource is deleted.
     */
    async function deleteByTarget(
        targetId: string,
        targetType: ResourceType
    ): Promise<void> {
        await db
            .delete(relationshipsTable)
            .where(
                and(
                    eq(relationshipsTable.targetId, targetId),
                    eq(relationshipsTable.targetType, targetType)
                )
            );
    }

    /**
     * Remove every relationship row (incoming and outgoing) involving an entry.
     * Used when an entry is permanently deleted.
     */
    async function deleteByEntry(id: string): Promise<void> {
        await deleteBySource(id, 'entry');
        await deleteByTarget(id, 'entry');
    }

    /**
     * Remove every relationship row (incoming and outgoing) involving a user.
     * Used when a user is permanently deleted.
     */
    async function deleteByUser(id: string): Promise<void> {
        await deleteBySource(id, 'user');
        await deleteByTarget(id, 'user');
    }

    /**
     * Remove every relationship row (incoming and outgoing) involving a media item.
     * Used when a media item is permanently deleted.
     */
    async function deleteByMedia(id: string): Promise<void> {
        await deleteBySource(id, 'media');
        await deleteByTarget(id, 'media');
    }

    /**
     * Replace all relationships for a source/name combination. Useful for form
     * submissions where all relations are set at once.
     */
    async function replaceAll(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        targetIds: string[],
        targetType: ResourceType
    ): Promise<void> {
        await deleteBySource(sourceId, sourceType, name);

        for (let i = 0; i < targetIds.length; i++) {
            const targetId = targetIds[i];
            if (targetId === undefined) continue;
            await create({
                sourceId,
                sourceType,
                name,
                targetId,
                targetType,
                position: i,
            });
        }
    }

    return {
        create,
        getBySource,
        getByTarget,
        updatePositions,
        delete: remove,
        deleteBySource,
        deleteByTarget,
        deleteByEntry,
        deleteByUser,
        deleteByMedia,
        replaceAll,
    };
}
