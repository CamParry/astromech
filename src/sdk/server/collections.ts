/**
 * Astromech Server Client
 *
 * Direct database access for use in Astro server-side code.
 * Import from 'astromech/server'
 */

import config from 'virtual:astromech/config';
import {
    and,
    asc,
    count,
    desc,
    eq,
    inArray,
    isNotNull,
    isNull,
    like,
    ne,
} from 'drizzle-orm';
import { getDb } from '@/db/registry.js';
import { entriesTable } from '@/db/schema.js';
import { RelationshipsRepository } from '@/db/repositories/relationships.js';
import { VersionsRepository } from '@/db/repositories/versions.js';
import { populateEntries } from '@/db/repositories/populate.js';
import type {
    CollectionApi,
    Entry,
    EntryStatus,
    EntryVersion,
    JsonObject,
    PaginationResult,
    QueryOptions,
    SortOption,
    TranslationInfo,
    User,
    WhereFilters,
} from '@/types/index.js';
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
            eq(entriesTable.collection, collection),
            eq(entriesTable.slug, candidate),
            isNull(entriesTable.deletedAt),
            ...(excludeId ? [ne(entriesTable.id, excludeId)] : []),
        ];

        const existing = await getDb()
            .select({ id: entriesTable.id })
            .from(entriesTable)
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
    | typeof entriesTable.title
    | typeof entriesTable.status
    | typeof entriesTable.createdAt
    | typeof entriesTable.updatedAt
    | typeof entriesTable.publishedAt
    | typeof entriesTable.slug;

const SORTABLE_FIELDS: Record<string, DrizzleColumn> = {
    title: entriesTable.title,
    status: entriesTable.status,
    createdAt: entriesTable.createdAt,
    updatedAt: entriesTable.updatedAt,
    publishedAt: entriesTable.publishedAt,
    slug: entriesTable.slug,
};

/**
 * Build Drizzle ORDER BY clauses from a sort option
 */
function buildOrderBy(sort?: SortOption | SortOption[]) {
    if (!sort) {
        return [desc(entriesTable.createdAt)];
    }

    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts
        .filter((s) => s.field in SORTABLE_FIELDS)
        .map((s) => {
            const column = SORTABLE_FIELDS[s.field]!;
            return s.direction === 'asc' ? asc(column) : desc(column);
        });

    return clauses.length > 0 ? clauses : [desc(entriesTable.createdAt)];
}

/**
 * Build Drizzle WHERE conditions from a WhereFilters object
 *
 * Supports top-level entry fields: status, slug, title, locale
 * Array values result in IN queries.
 */
function buildFilterConditions(filters: WhereFilters) {
    const conditions = [];

    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null) continue;

        if (key === '_search') {
            conditions.push(like(entriesTable.title, `%${value as string}%`));
        } else if (key === 'status') {
            if (Array.isArray(value)) {
                conditions.push(inArray(entriesTable.status, value as EntryStatus[]));
            } else {
                conditions.push(eq(entriesTable.status, value as EntryStatus));
            }
        } else if (key === 'slug') {
            conditions.push(eq(entriesTable.slug, value as string));
        } else if (key === 'title') {
            conditions.push(eq(entriesTable.title, value as string));
        } else if (key === 'locale') {
            conditions.push(eq(entriesTable.locale, value as string));
        }
    }

    return conditions;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract and save relationships from entry fields
 */
async function saveRelationships(
    entryId: string,
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

            const targetType = field.target === 'users' ? 'user' : 'entry';

            const targetIds = Array.isArray(fieldValue)
                ? (fieldValue as string[])
                : [fieldValue as string];

            await relationshipsRepo.replaceAll(
                entryId,
                'entry',
                field.name,
                targetIds,
                targetType
            );
        }
    }
}

function isVersioningEnabled(collectionName: string): boolean {
    const cfg = config.collections[collectionName];
    return !!cfg?.versioning;
}

async function buildRelationsSnapshot(
    entryId: string
): Promise<Record<string, string | string[]>> {
    const relRepo = new RelationshipsRepository(getDb());
    const rels = await relRepo.getBySource(entryId, 'entry');
    // rels are already ordered by position
    const byName = new Map<string, string[]>();
    for (const rel of rels) {
        if (!byName.has(rel.name)) byName.set(rel.name, []);
        byName.get(rel.name)!.push(rel.targetId);
    }
    const snapshot: Record<string, string | string[]> = {};
    for (const [name, ids] of byName) {
        snapshot[name] = ids.length === 1 ? ids[0]! : ids;
    }
    return snapshot;
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== (b as unknown[]).length) return false;
        return (a as unknown[]).every((v, i) => deepEqual(v, (b as unknown[])[i]));
    }
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
}

function buildLocaleCondition(collectionName: string, locale?: string) {
    const collectionConfig = config.collections[collectionName];
    if (!collectionConfig?.translatable) return null;
    const defaultLocale = (config as { defaultLocale?: string }).defaultLocale ?? 'en';
    return eq(entriesTable.locale, locale ?? defaultLocale);
}

function getNonTranslatableFieldNames(
    collectionName: string,
    fieldNames: string[]
): string[] {
    const collectionConfig = config.collections[collectionName];
    if (!collectionConfig?.translatable) return [];
    const nonTranslatable: string[] = [];
    for (const group of collectionConfig.fieldGroups) {
        for (const field of group.fields) {
            if (fieldNames.includes(field.name) && field.translatable === false) {
                nonTranslatable.push(field.name);
            }
        }
    }
    return nonTranslatable;
}

function buildIncomingRelations(
    collectionName: string,
    fields: JsonObject
): Record<string, string | string[]> {
    const collectionConfig = config.collections[collectionName];
    if (!collectionConfig) return {};
    const relations: Record<string, string | string[]> = {};
    for (const group of collectionConfig.fieldGroups) {
        for (const field of group.fields) {
            if (field.type !== 'relationship') continue;
            const val = fields[field.name];
            if (val !== undefined && val !== null) {
                relations[field.name] = val as string | string[];
            }
        }
    }
    return relations;
}

// ============================================================================
// Collection API Implementation
// ============================================================================

function createCollectionApi(collection: string): CollectionApi {
    const api: CollectionApi = {
        async all(options?: QueryOptions): Promise<Entry[]> {
            const filterConditions = options?.filters
                ? buildFilterConditions(options.filters)
                : [];
            const localeCondition = buildLocaleCondition(collection, options?.locale);
            const conditions = [
                eq(entriesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entriesTable.deletedAt)]),
                ...(localeCondition ? [localeCondition] : []),
                ...filterConditions,
            ];

            const orderClauses = buildOrderBy(options?.sort);

            const entries = await getDb()
                .select()
                .from(entriesTable)
                .where(and(...conditions))
                .orderBy(...orderClauses);

            const entriesArray = entries as Entry[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    return await populateEntries(
                        getDb(),
                        entriesArray,
                        collectionConfig.fieldGroups,
                        options.populate
                    );
                }
            }

            return entriesArray;
        },

        async paginate(
            perPage: number,
            page: number,
            options?: QueryOptions
        ): Promise<PaginationResult<Entry>> {
            const filterConditions = options?.filters
                ? buildFilterConditions(options.filters)
                : [];
            const localeCondition = buildLocaleCondition(collection, options?.locale);
            const conditions = [
                eq(entriesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entriesTable.deletedAt)]),
                ...(localeCondition ? [localeCondition] : []),
                ...filterConditions,
            ];

            const whereClause = and(...conditions);
            const orderClauses = buildOrderBy(options?.sort);

            const [countResult] = await getDb()
                .select({ count: count() })
                .from(entriesTable)
                .where(whereClause);

            const total = countResult?.count ?? 0;
            const totalPages = Math.ceil(total / perPage);
            const offset = (page - 1) * perPage;

            const entries = await getDb()
                .select()
                .from(entriesTable)
                .where(whereClause)
                .orderBy(...orderClauses)
                .limit(perPage)
                .offset(offset);

            let data = entries as Entry[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    data = await populateEntries(
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

        async get(id: string, options?: QueryOptions): Promise<Entry | null> {
            const entry = await getDb()
                .select()
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.id, id),
                        eq(entriesTable.collection, collection),
                        isNull(entriesTable.deletedAt)
                    )
                )
                .limit(1);

            if (!entry[0]) {
                return null;
            }

            let result = entry[0] as Entry;

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    const populated = await populateEntries(
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

        async where(filters: WhereFilters, options?: QueryOptions): Promise<Entry[]> {
            const filterConditions = buildFilterConditions(filters);
            const orderClauses = buildOrderBy(options?.sort);

            const conditions = [
                eq(entriesTable.collection, collection),
                ...(options?.withTrashed ? [] : [isNull(entriesTable.deletedAt)]),
                ...filterConditions,
            ];

            const entries = await getDb()
                .select()
                .from(entriesTable)
                .where(and(...conditions))
                .orderBy(...orderClauses);

            let data = entries as Entry[];

            if (options?.populate && options.populate.length > 0) {
                const collectionConfig = config.collections[collection];
                if (collectionConfig) {
                    data = await populateEntries(
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
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<Entry> {
            const status = data.status || 'draft';
            const publishedAt =
                status === 'published' ? new Date() : (data.publishAt ?? null);

            const baseSlug = data.slug ? data.slug : titleToSlug(data.title);
            const slug = await generateUniqueSlug(collection, baseSlug);

            const entry = await getDb()
                .insert(entriesTable)
                .values({
                    collection,
                    title: data.title,
                    slug,
                    locale: (config as { defaultLocale?: string }).defaultLocale ?? 'en',
                    fields: data.fields || {},
                    status,
                    publishedAt,
                })
                .returning();

            if (!entry[0]) {
                throw new Error('Failed to create entry');
            }

            const created = entry[0] as Entry;

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
                status: EntryStatus;
                publishAt: Date | null;
            }>
        ): Promise<Entry> {
            const current = await getDb()
                .select()
                .from(entriesTable)
                .where(eq(entriesTable.id, id))
                .limit(1);

            const currentEntry = current[0];
            if (!currentEntry) {
                throw new Error('Entry not found');
            }

            // --- Versioning ---
            if (isVersioningEnabled(collection)) {
                const currentRelations = await buildRelationsSnapshot(id);
                const incomingRelations = data.fields
                    ? buildIncomingRelations(collection, data.fields)
                    : currentRelations;

                const titleChanged =
                    data.title !== undefined && data.title !== currentEntry.title;
                const slugChanged =
                    data.slug !== undefined && data.slug !== currentEntry.slug;
                const fieldsChanged =
                    data.fields !== undefined &&
                    !deepEqual(currentEntry.fields, data.fields);
                const relationsChanged =
                    data.fields !== undefined &&
                    !deepEqual(currentRelations, incomingRelations);

                if (titleChanged || slugChanged || fieldsChanged || relationsChanged) {
                    const versionsRepo = new VersionsRepository(getDb());
                    const latestNumber = await versionsRepo.getLatestNumber(id);
                    await versionsRepo.create({
                        entryId: id,
                        versionNumber: latestNumber + 1,
                        title: currentEntry.title,
                        slug: currentEntry.slug,
                        fields: currentEntry.fields as JsonObject,
                        relations: currentRelations,
                        createdBy: null,
                    });
                }
            }

            let publishedAt = data.publishAt;
            if (data.status === 'published' && !currentEntry.publishedAt) {
                publishedAt = new Date();
            }

            // If slug is being updated, ensure uniqueness
            let slug = data.slug;
            if (slug && slug !== currentEntry.slug) {
                slug = await generateUniqueSlug(collection, slug, id);
            }

            const entry = await getDb()
                .update(entriesTable)
                .set({
                    title: data.title,
                    slug,
                    fields: data.fields,
                    status: data.status,
                    publishedAt,
                    updatedAt: new Date(),
                })
                .where(eq(entriesTable.id, id))
                .returning();

            if (!entry[0]) {
                throw new Error('Failed to update entry');
            }

            const updated = entry[0] as Entry;

            if (data.fields) {
                await saveRelationships(updated.id, data.fields, collection);
            }

            // --- Non-translatable field propagation ---
            if (data.fields) {
                const changedFieldNames = Object.keys(data.fields);
                const nonTranslatableNames = getNonTranslatableFieldNames(
                    collection,
                    changedFieldNames
                );
                if (nonTranslatableNames.length > 0) {
                    const nonTranslatableValues: JsonObject = {};
                    for (const name of nonTranslatableNames) {
                        nonTranslatableValues[name] = data.fields[name]!;
                    }

                    // Find siblings: source + other translations
                    const sourceId = currentEntry.translationOf ?? id;
                    const siblingConditions = [
                        eq(entriesTable.translationOf, sourceId),
                        ne(entriesTable.id, id),
                        isNull(entriesTable.deletedAt),
                    ];
                    const siblings = await getDb()
                        .select({ id: entriesTable.id, fields: entriesTable.fields })
                        .from(entriesTable)
                        .where(and(...siblingConditions));

                    // Include source entry if current entry is a translation
                    if (currentEntry.translationOf) {
                        const sourceEntry = await getDb()
                            .select({ id: entriesTable.id, fields: entriesTable.fields })
                            .from(entriesTable)
                            .where(eq(entriesTable.id, sourceId))
                            .limit(1);
                        if (sourceEntry[0]) siblings.push(sourceEntry[0]);
                    }

                    for (const sibling of siblings) {
                        const mergedFields = {
                            ...((sibling.fields as JsonObject) ?? {}),
                            ...nonTranslatableValues,
                        };
                        await getDb()
                            .update(entriesTable)
                            .set({ fields: mergedFields, updatedAt: new Date() })
                            .where(eq(entriesTable.id, sibling.id));
                    }
                }
            }

            return updated;
        },

        async trash(id: string): Promise<void> {
            const now = new Date();
            await getDb()
                .update(entriesTable)
                .set({ deletedAt: now })
                .where(
                    and(eq(entriesTable.id, id), eq(entriesTable.collection, collection))
                );
            // Cascade trash to translations
            await getDb()
                .update(entriesTable)
                .set({ deletedAt: now })
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.collection, collection),
                        isNull(entriesTable.deletedAt)
                    )
                );
        },

        async duplicate(id: string): Promise<Entry> {
            const original = await getDb()
                .select()
                .from(entriesTable)
                .where(
                    and(eq(entriesTable.id, id), eq(entriesTable.collection, collection))
                )
                .limit(1);

            if (!original[0]) {
                throw new Error('Entry not found');
            }

            const source = original[0] as Entry;
            const baseSlug = source.slug
                ? `${source.slug}-copy`
                : titleToSlug(`${source.title} copy`);
            const slug = await generateUniqueSlug(collection, baseSlug);

            const entry = await getDb()
                .insert(entriesTable)
                .values({
                    collection,
                    title: `${source.title} (Copy)`,
                    slug,
                    locale: (config as { defaultLocale?: string }).defaultLocale ?? 'en',
                    fields: (source.fields as JsonObject) || {},
                    status: 'draft',
                    publishedAt: null,
                })
                .returning();

            if (!entry[0]) {
                throw new Error('Failed to duplicate entry');
            }

            const created = entry[0] as Entry;

            // Copy relationships from original
            const relationshipsRepo = new RelationshipsRepository(getDb());
            const originalRels = await relationshipsRepo.getBySource(id, 'entry');

            for (const rel of originalRels) {
                await relationshipsRepo.create({
                    sourceId: created.id,
                    sourceType: 'entry',
                    name: rel.name,
                    targetId: rel.targetId,
                    targetType: rel.targetType,
                    position: rel.position,
                });
            }

            return created;
        },

        async trashed(
            options?: import('@/types/index.js').QueryOptions
        ): Promise<Entry[]> {
            const conditions = [
                eq(entriesTable.collection, collection),
                isNotNull(entriesTable.deletedAt),
            ];

            if (options?.locale) {
                conditions.push(eq(entriesTable.locale, options.locale));
            }

            const entries = await getDb()
                .select()
                .from(entriesTable)
                .where(and(...conditions))
                .orderBy(desc(entriesTable.deletedAt));

            return entries as Entry[];
        },

        async restore(id: string): Promise<Entry> {
            const entry = await getDb()
                .update(entriesTable)
                .set({ deletedAt: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(entriesTable.id, id),
                        eq(entriesTable.collection, collection),
                        isNotNull(entriesTable.deletedAt)
                    )
                )
                .returning();

            if (!entry[0]) {
                throw new Error('Entry not found in trash');
            }

            // Cascade restore to translations
            await getDb()
                .update(entriesTable)
                .set({ deletedAt: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.collection, collection),
                        isNotNull(entriesTable.deletedAt)
                    )
                );

            return entry[0] as Entry;
        },

        async delete(id: string): Promise<void> {
            const relationshipsRepo = new RelationshipsRepository(getDb());

            // Delete translations first
            const translations = await getDb()
                .select({ id: entriesTable.id })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.collection, collection)
                    )
                );

            for (const { id: translationId } of translations) {
                await relationshipsRepo.deleteBySource(translationId, 'entry');
            }

            if (translations.length > 0) {
                await getDb()
                    .delete(entriesTable)
                    .where(
                        and(
                            eq(entriesTable.translationOf, id),
                            eq(entriesTable.collection, collection)
                        )
                    );
            }

            await relationshipsRepo.deleteBySource(id, 'entry');

            await getDb()
                .delete(entriesTable)
                .where(
                    and(eq(entriesTable.id, id), eq(entriesTable.collection, collection))
                );
        },

        async emptyTrash(): Promise<void> {
            // Find all trashed entries for this collection to clean up relationships
            const trashed = await getDb()
                .select({ id: entriesTable.id })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.collection, collection),
                        isNotNull(entriesTable.deletedAt)
                    )
                );

            const relationshipsRepo = new RelationshipsRepository(getDb());
            for (const { id } of trashed) {
                await relationshipsRepo.deleteBySource(id, 'entry');
            }

            await getDb()
                .delete(entriesTable)
                .where(
                    and(
                        eq(entriesTable.collection, collection),
                        isNotNull(entriesTable.deletedAt)
                    )
                );
        },

        async versions(id: string): Promise<EntryVersion[]> {
            const versionsRepo = new VersionsRepository(getDb());
            const rows = await versionsRepo.list(id);
            return rows as unknown as EntryVersion[];
        },

        async restoreVersion(id: string, versionId: string): Promise<Entry> {
            const versionsRepo = new VersionsRepository(getDb());
            const version = await versionsRepo.get(versionId);
            if (!version || version.entryId !== id) {
                throw new Error('Version not found');
            }

            const current = await getDb()
                .select()
                .from(entriesTable)
                .where(eq(entriesTable.id, id))
                .limit(1);

            const currentEntry = current[0];
            if (!currentEntry) throw new Error('Entry not found');

            // Snapshot current state before restoring
            const currentRelations = await buildRelationsSnapshot(id);
            const latestNumber = await versionsRepo.getLatestNumber(id);
            await versionsRepo.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: currentEntry.title,
                slug: currentEntry.slug,
                fields: currentEntry.fields as JsonObject,
                relations: currentRelations,
                createdBy: null,
            });

            // Determine new slug
            let slug = version.slug;
            if (slug && slug !== currentEntry.slug) {
                slug = await generateUniqueSlug(collection, slug, id);
            }

            // Apply restored version to entry
            const updated = await getDb()
                .update(entriesTable)
                .set({
                    title: version.title,
                    slug: slug ?? currentEntry.slug,
                    fields: (version.fields as JsonObject) ?? currentEntry.fields,
                    updatedAt: new Date(),
                })
                .where(eq(entriesTable.id, id))
                .returning();

            if (!updated[0]) throw new Error('Failed to restore entry');

            // Rebuild relationship rows from version snapshot
            if (version.relations) {
                const relRepo = new RelationshipsRepository(getDb());
                for (const [fieldName, targetIds] of Object.entries(
                    version.relations as Record<string, unknown>
                )) {
                    const ids = Array.isArray(targetIds)
                        ? (targetIds as string[])
                        : [targetIds as string];
                    // Determine target type from collection config
                    const collectionConfig = config.collections[collection];
                    let targetType: 'entry' | 'user' | 'media' = 'entry';
                    if (collectionConfig) {
                        for (const group of collectionConfig.fieldGroups) {
                            const field = group.fields.find((f) => f.name === fieldName);
                            if (
                                field?.type === 'relationship' &&
                                field.target === 'users'
                            ) {
                                targetType = 'user';
                            }
                        }
                    }
                    await relRepo.replaceAll(id, 'entry', fieldName, ids, targetType);
                }
            }

            return updated[0] as unknown as Entry;
        },

        async translations(id: string): Promise<TranslationInfo[]> {
            const rows = await getDb()
                .select({
                    id: entriesTable.id,
                    locale: entriesTable.locale,
                    slug: entriesTable.slug,
                    status: entriesTable.status,
                })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        isNull(entriesTable.deletedAt)
                    )
                );

            return rows.map((row) => ({
                entryId: row.id,
                locale: row.locale ?? '',
                slug: row.slug,
                status: row.status,
            }));
        },

        async createTranslation(
            sourceId: string,
            locale: string,
            options?: { copyFields?: boolean }
        ): Promise<Entry> {
            const copyFields = options?.copyFields ?? true;

            const source = await getDb()
                .select()
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.id, sourceId),
                        eq(entriesTable.collection, collection),
                        isNull(entriesTable.deletedAt)
                    )
                )
                .limit(1);

            if (!source[0]) throw new Error('Source entry not found');
            if (source[0].translationOf !== null)
                throw new Error('Source entry is itself a translation');

            // Check if translation already exists for this locale
            const existing = await getDb()
                .select({ id: entriesTable.id })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.translationOf, sourceId),
                        eq(entriesTable.locale, locale),
                        isNull(entriesTable.deletedAt)
                    )
                )
                .limit(1);

            if (existing[0])
                throw new Error(`Translation for locale '${locale}' already exists`);

            const sourceEntry = source[0] as Entry;
            const fields = copyFields ? ((sourceEntry.fields as JsonObject) ?? {}) : {};
            const slug = sourceEntry.slug;

            const inserted = await getDb()
                .insert(entriesTable)
                .values({
                    collection,
                    locale,
                    translationOf: sourceId,
                    title: sourceEntry.title,
                    slug,
                    fields,
                    status: 'draft',
                    publishedAt: null,
                })
                .returning();

            if (!inserted[0]) throw new Error('Failed to create translation');

            const created = inserted[0] as Entry;

            if (copyFields) {
                // Copy relationships from source
                const relRepo = new RelationshipsRepository(getDb());
                const sourceRels = await relRepo.getBySource(sourceId, 'entry');
                for (const rel of sourceRels) {
                    await relRepo.create({
                        sourceId: created.id,
                        sourceType: 'entry',
                        name: rel.name,
                        targetId: rel.targetId,
                        targetType: rel.targetType,
                        position: rel.position,
                    });
                }
            }

            return created;
        },

        async publish(id: string): Promise<Entry> {
            return api.update(id, { status: 'published', publishAt: null });
        },

        async unpublish(id: string): Promise<Entry> {
            return api.update(id, { status: 'draft', publishAt: null });
        },

        async schedule(id: string, publishAt: Date): Promise<Entry> {
            return api.update(id, { status: 'scheduled', publishAt });
        },

        async getTranslation(sourceId: string, locale: string): Promise<Entry | null> {
            const defaultLocale =
                (config as { defaultLocale?: string }).defaultLocale ?? 'en';

            // Requesting default locale = return the source entry itself
            if (locale === defaultLocale) {
                const result = await getDb()
                    .select()
                    .from(entriesTable)
                    .where(
                        and(
                            eq(entriesTable.id, sourceId),
                            eq(entriesTable.collection, collection),
                            isNull(entriesTable.deletedAt)
                        )
                    )
                    .limit(1);
                return (result[0] as Entry) ?? null;
            }

            const result = await getDb()
                .select()
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.translationOf, sourceId),
                        eq(entriesTable.locale, locale),
                        isNull(entriesTable.deletedAt)
                    )
                )
                .limit(1);

            return (result[0] as Entry) ?? null;
        },
    };
    return api;
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
