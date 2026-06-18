/**
 * Relationships Repository
 * Handles CRUD operations for entry/user/media relationships
 */

import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
    relationshipsTable,
    type RelationshipRow,
    type NewRelationshipRow,
} from '@/database/schema';
import type { ResourceType } from '@/types/index.js';

export class RelationshipsRepository {
    constructor(private db: LibSQLDatabase) {}

    /**
     * Create a new relationship
     */
    async create(data: {
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

        const result = await this.db
            .insert(relationshipsTable)
            .values(relationship)
            .returning();
        const created = result[0];
        if (!created) {
            throw new Error('Failed to create relationship: insert returned no row');
        }
        return created;
    }

    /**
     * Get all relationships for a source resource
     */
    async getBySource(
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

        return this.db
            .select()
            .from(relationshipsTable)
            .where(and(...conditions))
            .orderBy(relationshipsTable.position);
    }

    /**
     * Get all relationships pointing to a target resource
     */
    async getByTarget(
        targetId: string,
        targetType: ResourceType
    ): Promise<RelationshipRow[]> {
        return this.db
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

    /**
     * Update relationship positions (for ordered relations)
     */
    async updatePositions(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        orderedTargetIds: string[]
    ): Promise<void> {
        for (let i = 0; i < orderedTargetIds.length; i++) {
            const targetId = orderedTargetIds[i];
            if (targetId === undefined) continue;
            await this.db
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

    /**
     * Delete a specific relationship
     */
    async delete(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        targetId: string
    ): Promise<void> {
        await this.db
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

    /**
     * Delete all relationships for a source
     */
    async deleteBySource(
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

        await this.db.delete(relationshipsTable).where(and(...conditions));
    }

    /**
     * Delete all relationships pointing to a target
     * Used for cascade delete or cleaning up when a resource is deleted
     */
    async deleteByTarget(targetId: string, targetType: ResourceType): Promise<void> {
        await this.db
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
    async deleteByEntry(id: string): Promise<void> {
        await this.deleteBySource(id, 'entry');
        await this.deleteByTarget(id, 'entry');
    }

    /**
     * Remove every relationship row (incoming and outgoing) involving a user.
     * Used when a user is permanently deleted.
     */
    async deleteByUser(id: string): Promise<void> {
        await this.deleteBySource(id, 'user');
        await this.deleteByTarget(id, 'user');
    }

    /**
     * Remove every relationship row (incoming and outgoing) involving a media item.
     * Used when a media item is permanently deleted.
     */
    async deleteByMedia(id: string): Promise<void> {
        await this.deleteBySource(id, 'media');
        await this.deleteByTarget(id, 'media');
    }

    /**
     * Replace all relationships for a source/name combination
     * Useful for form submissions where all relations are set at once
     */
    async replaceAll(
        sourceId: string,
        sourceType: ResourceType,
        name: string,
        targetIds: string[],
        targetType: ResourceType
    ): Promise<void> {
        // Delete existing relationships
        await this.deleteBySource(sourceId, sourceType, name);

        // Create new relationships
        for (let i = 0; i < targetIds.length; i++) {
            const targetId = targetIds[i];
            if (targetId === undefined) continue;
            await this.create({
                sourceId,
                sourceType,
                name,
                targetId,
                targetType,
                position: i,
            });
        }
    }
}
