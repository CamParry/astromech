/**
 * Relationships Repository
 * Handles CRUD operations for entity/user/media relationships
 */

import { eq, and, desc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { relationshipsTable, type RelationshipRow, type NewRelationshipRow } from '@/db/schema';
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

		const result = await this.db.insert(relationshipsTable).values(relationship).returning();
		return result[0]!;
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
	async getByTarget(targetId: string, targetType: ResourceType): Promise<RelationshipRow[]> {
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
			const targetId = orderedTargetIds[i]!;
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
	async deleteBySource(sourceId: string, sourceType: ResourceType, name?: string): Promise<void> {
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
			await this.create({
				sourceId,
				sourceType,
				name,
				targetId: targetIds[i]!,
				targetType,
				position: i,
			});
		}
	}
}
