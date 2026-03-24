/**
 * Astromech Server Client
 *
 * Direct database access for use in Astro server-side code.
 * Import from 'astromech/server'
 */

import config from 'virtual:astromech/config';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, ne } from 'drizzle-orm';
import { getDb } from '@/db/registry.js';
import { entitiesTable } from '@/db/schema.js';
import { RelationshipsRepository } from '@/db/repositories/relationships.js';
import { populateEntities } from '@/db/repositories/populate.js';
import type {
    AstromechClient,
    CollectionApi,
    Entity,
    EntityStatus,
    EntityVersion,
    JsonObject,
    JsonValue,
    Media,
    MediaApi,
    PaginationResult,
    QueryOptions,
    Setting,
    SettingsApi,
    SortOption,
    TranslationInfo,
    User,
    UsersApi,
    WhereFilters,
} from '@/types/index.js';
import { usersApi } from '@/sdk/server/users.js';
import { setCurrentUser } from '@/sdk/server/context.js';
import { titleToSlug } from '@/support/strings.js';

// ============================================================================
// Server Context (populated by middleware)
// ============================================================================

/**
 * @deprecated Use setCurrentUser from @/sdk/server/context.js instead.
 */
export function initServerContext(ctx: {
    db: unknown;
    config: unknown;
    user: User | null;
}): void {
    setCurrentUser(ctx.user);
}

// ============================================================================
// Slug Utilities
// ============================================================================

/**
 * Generate a unique slug for a collection, appending -2, -3, etc. on collision
 */
async function generateUniqueSlug(
    collection: string,
    baseSlug: string,
    excludeId?: string
): Promise<string> {
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
        const conditions = [
            eq(entitiesTable.collection, collection),
            eq(entitiesTable.slug, candidate),
            isNull(entitiesTable.deletedAt),
            ...(excludeId ? [ne(entitiesTable.id, excludeId)] : []),
        ];

        const existing = await getDb()
            .select({ id: entitiesTable.id })
            .from(entitiesTable)
            .where(and(...conditions))
            .limit(1);

        if (!existing[0]) {
            return candidate;
        }

        counter++;
        candidate = `${baseSlug}-${counter}`;
    }
}

// ============================================================================
// Query Helpers
// ============================================================================

type DrizzleColumn =
    | typeof entitiesTable.title
    | typeof entitiesTable.status
    | typeof entitiesTable.createdAt
    | typeof entitiesTable.updatedAt
    | typeof entitiesTable.publishedAt
    | typeof entitiesTable.slug;

const SORTABLE_FIELDS: Record<string, DrizzleColumn> = {
    title: entitiesTable.title,
    status: entitiesTable.status,
    createdAt: entitiesTable.createdAt,
    updatedAt: entitiesTable.updatedAt,
    publishedAt: entitiesTable.publishedAt,
    slug: entitiesTable.slug,
};

/**
 * Build Drizzle ORDER BY clauses from a sort option
 */
function buildOrderBy(sort?: SortOption | SortOption[]) {
    if (!sort) {
        return [desc(entitiesTable.createdAt)];
    }

    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts
        .filter((s) => s.field in SORTABLE_FIELDS)
        .map((s) => {
            const column = SORTABLE_FIELDS[s.field]!;
            return s.direction === 'asc' ? asc(column) : desc(column);
        });

    return clauses.length > 0 ? clauses : [desc(entitiesTable.createdAt)];
}

/**
 * Build Drizzle WHERE conditions from a WhereFilters object
 *
 * Supports top-level entity fields: status, slug, title, locale
 * Array values result in IN queries.
 */
function buildFilterConditions(filters: WhereFilters) {
    const conditions = [];

    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null) continue;

        if (key === '_search') {
            conditions.push(like(entitiesTable.title, `%${value as string}%`));
        } else if (key === 'status') {
            if (Array.isArray(value)) {
                conditions.push(inArray(entitiesTable.status, value as EntityStatus[]));
            } else {
                conditions.push(eq(entitiesTable.status, value as EntityStatus));
            }
        } else if (key === 'slug') {
            conditions.push(eq(entitiesTable.slug, value as string));
        } else if (key === 'title') {
            conditions.push(eq(entitiesTable.title, value as string));
        } else if (key === 'locale') {
            conditions.push(eq(entitiesTable.locale, value as string));
        }
    }

    return conditions;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract and save relationships from entity fields
 */
async function saveRelationships(
    entityId: string,
    fields: JsonObject,
    collectionName: string
): Promise<void> {
    const relationshipsRepo = new RelationshipsRepository(getDb());
    const collectionConfig = config.collections[collectionName];

    if (!collectionConfig) return;

    for (const group of collectionConfig.fieldGroups) {
        for (const field of group.fields) {
            if (field.type !== 'relationship') continue;
            if (!field.target) continue;

            const fieldValue = fields[field.name];
            if (!fieldValue) continue;

            const targetType = field.target === 'users' ? 'user' : 'entity';

            const targetIds = Array.isArray(fieldValue)
                ? (fieldValue as string[])
                : [fieldValue as string];

            await relationshipsRepo.replaceAll(
                entityId,
                'entity',
                field.name,
                targetIds,
                targetType
            );
        }
    }
}

// ============================================================================
// Collection API Implementation
// ============================================================================

function createCollectionApi(collection: string): CollectionApi {
    return {
        async all(options?: QueryOptions): Promise<Entity[]> {
            const filterConditions = options?.filters
                ? buildFilterConditions(options.filters)
                : [];
            const conditions = [
                eq(entitiesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entitiesTable.deletedAt)]),
                ...filterConditions,
            ];

            const orderClauses = buildOrderBy(options?.sort);

            const entities = await getDb()
                .select()
                .from(entitiesTable)
                .where(and(...conditions))
                .orderBy(...orderClauses);

            const entitiesArray = entities as Entity[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    return await populateEntities(
                        getDb(),
                        entitiesArray,
                        collectionConfig.fieldGroups,
                        options.populate
                    );
                }
            }

            return entitiesArray;
        },

        async paginate(
            perPage: number,
            page: number,
            options?: QueryOptions
        ): Promise<PaginationResult<Entity>> {
            const filterConditions = options?.filters
                ? buildFilterConditions(options.filters)
                : [];
            const conditions = [
                eq(entitiesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entitiesTable.deletedAt)]),
                ...filterConditions,
            ];

            const whereClause = and(...conditions);
            const orderClauses = buildOrderBy(options?.sort);

            const [countResult] = await getDb()
                .select({ count: count() })
                .from(entitiesTable)
                .where(whereClause);

            const total = countResult?.count ?? 0;
            const totalPages = Math.ceil(total / perPage);
            const offset = (page - 1) * perPage;

            const entities = await getDb()
                .select()
                .from(entitiesTable)
                .where(whereClause)
                .orderBy(...orderClauses)
                .limit(perPage)
                .offset(offset);

            let data = entities as Entity[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    data = await populateEntities(
                        getDb(),
                        data,
                        collectionConfig.fieldGroups,
                        options.populate
                    );
                }
            }

            return {
                data,
                pagination: {
                    page,
                    perPage,
                    total,
                    totalPages,
                },
            };
        },

        async get(id: string, options?: QueryOptions): Promise<Entity | null> {
            const entity = await getDb()
                .select()
                .from(entitiesTable)
                .where(
                    and(
                        eq(entitiesTable.id, id),
                        eq(entitiesTable.collection, collection),
                        isNull(entitiesTable.deletedAt)
                    )
                )
                .limit(1);

            if (!entity[0]) {
                return null;
            }

            let result = entity[0] as Entity;

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    const populated = await populateEntities(
                        getDb(),
                        [result],
                        collectionConfig.fieldGroups,
                        options.populate
                    );
                    result = populated[0] || result;
                }
            }

            return result;
        },

        async where(filters: WhereFilters, options?: QueryOptions): Promise<Entity[]> {
            const filterConditions = buildFilterConditions(filters);
            const orderClauses = buildOrderBy(options?.sort);

            const conditions = [
                eq(entitiesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entitiesTable.deletedAt)]),
                ...filterConditions,
            ];

            const entities = await getDb()
                .select()
                .from(entitiesTable)
                .where(and(...conditions))
                .orderBy(...orderClauses);

            let data = entities as Entity[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    data = await populateEntities(
                        getDb(),
                        data,
                        collectionConfig.fieldGroups,
                        options.populate
                    );
                }
            }

            return data;
        },

        async create(data: {
            title: string;
            slug?: string;
            fields?: JsonObject;
            status?: EntityStatus;
            publishAt?: Date | null;
        }): Promise<Entity> {
            const status = data.status || 'draft';
            const publishedAt =
                status === 'published' ? new Date() : (data.publishAt ?? null);

            const baseSlug = data.slug
                ? data.slug
                : titleToSlug(data.title);
            const slug = await generateUniqueSlug(collection, baseSlug);

            const entity = await getDb()
                .insert(entitiesTable)
                .values({
                    collection,
                    title: data.title,
                    slug,
                    locale: 'en',
                    fields: data.fields || {},
                    status,
                    publishedAt,
                })
                .returning();

            if (!entity[0]) {
                throw new Error('Failed to create entity');
            }

            const created = entity[0] as Entity;

            if (data.fields) {
                await saveRelationships(created.id, data.fields, collection);
            }

            return created;
        },

        async update(
            id: string,
            data: Partial<{
                title: string;
                slug: string;
                fields: JsonObject;
                status: EntityStatus;
                publishAt: Date | null;
            }>
        ): Promise<Entity> {
            const current = await getDb()
                .select()
                .from(entitiesTable)
                .where(eq(entitiesTable.id, id))
                .limit(1);

            const currentEntity = current[0];
            if (!currentEntity) {
                throw new Error('Entity not found');
            }

            let publishedAt = data.publishAt;
            if (data.status === 'published' && !currentEntity.publishedAt) {
                publishedAt = new Date();
            }

            // If slug is being updated, ensure uniqueness
            let slug = data.slug;
            if (slug && slug !== currentEntity.slug) {
                slug = await generateUniqueSlug(collection, slug, id);
            }

            const entity = await getDb()
                .update(entitiesTable)
                .set({
                    title: data.title,
                    slug,
                    fields: data.fields,
                    status: data.status,
                    publishedAt,
                    updatedAt: new Date(),
                })
                .where(eq(entitiesTable.id, id))
                .returning();

            if (!entity[0]) {
                throw new Error('Failed to update entity');
            }

            const updated = entity[0] as Entity;

            if (data.fields) {
                await saveRelationships(updated.id, data.fields, collection);
            }

            return updated;
        },

        async trash(id: string): Promise<void> {
            await getDb()
                .update(entitiesTable)
                .set({ deletedAt: new Date() })
                .where(
                    and(
                        eq(entitiesTable.id, id),
                        eq(entitiesTable.collection, collection)
                    )
                );
        },

        async duplicate(id: string): Promise<Entity> {
            const original = await getDb()
                .select()
                .from(entitiesTable)
                .where(
                    and(
                        eq(entitiesTable.id, id),
                        eq(entitiesTable.collection, collection)
                    )
                )
                .limit(1);

            if (!original[0]) {
                throw new Error('Entity not found');
            }

            const source = original[0] as Entity;
            const baseSlug = source.slug
                ? `${source.slug}-copy`
                : titleToSlug(`${source.title} copy`);
            const slug = await generateUniqueSlug(collection, baseSlug);

            const entity = await getDb()
                .insert(entitiesTable)
                .values({
                    collection,
                    title: `${source.title} (Copy)`,
                    slug,
                    locale: source.locale ?? 'en',
                    fields: (source.fields as JsonObject) || {},
                    status: 'draft',
                    publishedAt: null,
                })
                .returning();

            if (!entity[0]) {
                throw new Error('Failed to duplicate entity');
            }

            const created = entity[0] as Entity;

            // Copy relationships from original
            const relationshipsRepo = new RelationshipsRepository(getDb());
            const originalRels = await relationshipsRepo.getBySource(id, 'entity');

            for (const rel of originalRels) {
                await relationshipsRepo.create({
                    sourceId: created.id,
                    sourceType: 'entity',
                    name: rel.name,
                    targetId: rel.targetId,
                    targetType: rel.targetType,
                    position: rel.position,
                });
            }

            return created;
        },

        async trashed(options?: import('@/types/index.js').QueryOptions): Promise<Entity[]> {
            const conditions = [
                eq(entitiesTable.collection, collection),
                isNotNull(entitiesTable.deletedAt),
            ];

            if (options?.locale) {
                conditions.push(eq(entitiesTable.locale, options.locale));
            }

            const entities = await getDb()
                .select()
                .from(entitiesTable)
                .where(and(...conditions))
                .orderBy(desc(entitiesTable.deletedAt));

            return entities as Entity[];
        },

        async restore(id: string): Promise<Entity> {
            const entity = await getDb()
                .update(entitiesTable)
                .set({ deletedAt: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(entitiesTable.id, id),
                        eq(entitiesTable.collection, collection),
                        isNotNull(entitiesTable.deletedAt)
                    )
                )
                .returning();

            if (!entity[0]) {
                throw new Error('Entity not found in trash');
            }

            return entity[0] as Entity;
        },

        async delete(id: string): Promise<void> {
            const relationshipsRepo = new RelationshipsRepository(getDb());
            await relationshipsRepo.deleteBySource(id, 'entity');

            await getDb()
                .delete(entitiesTable)
                .where(
                    and(
                        eq(entitiesTable.id, id),
                        eq(entitiesTable.collection, collection)
                    )
                );
        },

        async emptyTrash(): Promise<void> {
            // Find all trashed entities for this collection to clean up relationships
            const trashed = await getDb()
                .select({ id: entitiesTable.id })
                .from(entitiesTable)
                .where(
                    and(
                        eq(entitiesTable.collection, collection),
                        isNotNull(entitiesTable.deletedAt)
                    )
                );

            const relationshipsRepo = new RelationshipsRepository(getDb());
            for (const { id } of trashed) {
                await relationshipsRepo.deleteBySource(id, 'entity');
            }

            await getDb()
                .delete(entitiesTable)
                .where(
                    and(
                        eq(entitiesTable.collection, collection),
                        isNotNull(entitiesTable.deletedAt)
                    )
                );
        },

        async versions(id: string): Promise<EntityVersion[]> {
            // TODO: Implement version history query
            throw new Error('Not implemented');
        },

        async restoreVersion(id: string, versionId: string): Promise<Entity> {
            // TODO: Implement version restore
            throw new Error('Not implemented');
        },

        async translations(id: string): Promise<TranslationInfo[]> {
            // TODO: Implement translations query via relationships table
            throw new Error('Not implemented');
        },

        async translate(
            id: string,
            locale: string,
            data?: Partial<{ title: string; fields: JsonObject }>
        ): Promise<Entity> {
            // TODO: Implement translation creation
            throw new Error('Not implemented');
        },
    };
}

// ============================================================================
// Collections Proxy
// ============================================================================

export const collectionsProxy = new Proxy(
    {},
    {
        get(_target, prop: string) {
            return createCollectionApi(prop);
        },
    }
) as Record<string, CollectionApi>;
