/**
 * Entity Population Utility
 * Handles loading related entities/users/media for relation fields
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Entity, FieldDefinition, FieldGroup } from '@/types/index.js';
import { RelationshipsRepository } from '@/db/repositories/relationships';
import { eq, inArray } from 'drizzle-orm';
import { entitiesTable, usersTable } from '@/db/schema';

type PopulatedEntity = Entity & {
	_populated: Record<string, unknown | unknown[]>;
};

/**
 * Populate relation fields in entities
 */
export async function populateEntities(
	db: LibSQLDatabase,
	entities: Entity[],
	fieldGroups: FieldGroup[],
	populate: string[]
): Promise<Entity[]> {
	if (!populate || populate.length === 0) {
		return entities;
	}

	const relationshipsRepo = new RelationshipsRepository(db);

	// Build a map of field names to their definitions
	const relationFields = new Map<string, FieldDefinition>();
	for (const group of fieldGroups) {
		for (const field of group.fields) {
			if (field.type === 'relationship' && populate.includes(field.name)) {
				relationFields.set(field.name, field);
			}
		}
	}

	// Populate each entity
	const populated: Entity[] = [];

	for (const entity of entities) {
		const populatedEntity: PopulatedEntity = { ...entity, _populated: {} };

		// For each relation field to populate
		for (const [fieldName, fieldDef] of relationFields) {
			// Get relationships for this field
			const relationships = await relationshipsRepo.getBySource(
				entity.id,
				'entity',
				fieldName
			);

			if (relationships.length === 0) {
				populatedEntity._populated[fieldName] = fieldDef.multiple ? [] : null;
				continue;
			}

			// Group by target type to batch queries
			const entityTargets = relationships
				.filter((r) => r.targetType === 'entity')
				.map((r) => r.targetId);
			const userTargets = relationships
				.filter((r) => r.targetType === 'user')
				.map((r) => r.targetId);

			const loadedEntities: Record<string, unknown> = {};

			// Batch load entities
			if (entityTargets.length > 0) {
				const loaded = await db
					.select()
					.from(entitiesTable)
					.where(inArray(entitiesTable.id, entityTargets));

				for (const e of loaded) {
					loadedEntities[e.id] = e;
				}
			}

			// Batch load users
			if (userTargets.length > 0) {
				const loaded = await db
					.select()
					.from(usersTable)
					.where(inArray(usersTable.id, userTargets));

				for (const u of loaded) {
					loadedEntities[u.id] = u;
				}
			}

			// TODO: Load media when media table is enabled

			// Build the populated result in the correct order
			const orderedResults = relationships
				.map((r) => loadedEntities[r.targetId])
				.filter(Boolean);

			if (fieldDef.multiple) {
				populatedEntity._populated[fieldName] = orderedResults;
			} else {
				populatedEntity._populated[fieldName] = orderedResults[0] ?? null;
			}
		}

		// Merge populated values into entity.fields and strip the internal _populated map
		const mergedFields = { ...populatedEntity.fields };
		for (const [fieldName, value] of Object.entries(populatedEntity._populated)) {
			mergedFields[fieldName] = value as import('@/types/index.js').JsonValue;
		}
		const { _populated: _, ...rest } = populatedEntity;
		populated.push({ ...rest, fields: mergedFields });
	}

	return populated;
}
