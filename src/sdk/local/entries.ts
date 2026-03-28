/**
 * Astromech Server Entries API
 *
 * Unified entries object for direct database access in Astro server-side code.
 * Import from 'astromech/local'
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
import { z } from 'zod';
import { getDb } from '@/db/registry.js';
import { entriesTable } from '@/db/schema.js';
import type { EntryRow } from '@/db/schema.js';
import { ValidationError } from '@/errors/validation.js';
import {
    createEntrySchema,
    updateEntrySchema,
    scheduleEntrySchema,
    createTranslationSchema,
} from '@/schemas/entries.js';
import { RelationshipsRepository } from '@/db/repositories/relationships.js';
import { VersionsRepository } from '@/db/repositories/versions.js';
import { populateEntries } from '@/db/repositories/populate.js';
import type {
    Entry,
    EntryStatus,
    EntryVersion,
    EntriesApi,
    EntryQueryParams,
    QueryResult,
    JsonObject,
    SortOption,
    TranslationInfo,
    User,
    WhereFilters,
} from '@/types/index.js';
import { setCurrentUser } from '@/sdk/local/context.js';
import { titleToSlug } from '@/support/strings.js';

// ============================================================================
// Validation Helper
// ============================================================================

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

// ============================================================================
// Server Context (populated by middleware)
// ============================================================================

/**
 * @deprecated Use setCurrentUser from @/sdk/local/context.js instead.
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
 * Generate a unique slug for an entry type, appending -2, -3, etc. on collision
 */
async function generateUniqueSlug(
    type: string,
    baseSlug: string,
    excludeId?: string
): Promise<string> {
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
        const conditions = [
            eq(entriesTable.type, type),
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
    if (!sort) return [desc(entriesTable.createdAt)];

    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s)
            .filter(([field]) => field in SORTABLE_FIELDS)
            .map(([field, dir]) => {
                const column = SORTABLE_FIELDS[field]!;
                return dir === 'asc' ? asc(column) : desc(column);
            })
    );

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
    typeName: string
): Promise<void> {
    const relationshipsRepo = new RelationshipsRepository(getDb());
    const entryTypeConfig = config.entries[typeName];

    if (!entryTypeConfig) return;

    for (const group of entryTypeConfig.fieldGroups) {
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

function isVersioningEnabled(typeName: string): boolean {
    const cfg = config.entries[typeName];
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

function buildLocaleCondition(typeName: string, locale?: string) {
    const entryTypeConfig = config.entries[typeName];
    if (!entryTypeConfig?.translatable) return null;
    const defaultLocale = (config as { defaultLocale?: string }).defaultLocale ?? 'en';
    return eq(entriesTable.locale, locale ?? defaultLocale);
}

function getNonTranslatableFieldNames(
    typeName: string,
    fieldNames: string[]
): string[] {
    const entryTypeConfig = config.entries[typeName];
    if (!entryTypeConfig?.translatable) return [];
    const nonTranslatable: string[] = [];
    for (const group of entryTypeConfig.fieldGroups) {
        for (const field of group.fields) {
            if (fieldNames.includes(field.name) && field.translatable === false) {
                nonTranslatable.push(field.name);
            }
        }
    }
    return nonTranslatable;
}

function buildIncomingRelations(
    typeName: string,
    fields: JsonObject
): Record<string, string | string[]> {
    const entryTypeConfig = config.entries[typeName];
    if (!entryTypeConfig) return {};
    const relations: Record<string, string | string[]> = {};
    for (const group of entryTypeConfig.fieldGroups) {
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
// Entries API
// ============================================================================

export const entries: EntriesApi = {
    async query(params?: EntryQueryParams): Promise<QueryResult<Entry>> {
        const type = params?.type;
        const trashed = params?.trashed ?? false;
        const limit = params?.limit;
        const page = params?.page ?? 1;

        const filterConditions = params?.where
            ? buildFilterConditions(params.where)
            : [];
        const localeCondition = type ? buildLocaleCondition(type, params?.locale) : null;
        const searchCondition = params?.search
            ? like(entriesTable.title, `%${params.search}%`)
            : null;

        const conditions = [
            ...(type ? [eq(entriesTable.type, type)] : []),
            trashed ? isNotNull(entriesTable.deletedAt) : isNull(entriesTable.deletedAt),
            ...(localeCondition ? [localeCondition] : []),
            ...(searchCondition ? [searchCondition] : []),
            ...filterConditions,
        ];

        const whereClause = and(...conditions);
        const orderClauses = buildOrderBy(params?.sort);

        if (limit === 'all') {
            const rows = await getDb()
                .select()
                .from(entriesTable)
                .where(whereClause)
                .orderBy(...orderClauses);

            let data = rows as Entry[];

            if (type && params?.populate && params.populate.length > 0) {
                const entryTypeConfig = config.entries[type];
                if (entryTypeConfig) {
                    data = await populateEntries(getDb(), data, entryTypeConfig.fieldGroups, params.populate);
                }
            }

            return { data, pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [countResult] = await getDb()
            .select({ count: count() })
            .from(entriesTable)
            .where(whereClause);

        const total = countResult?.count ?? 0;
        const pages = Math.ceil(total / perPage);

        const rows = await getDb()
            .select()
            .from(entriesTable)
            .where(whereClause)
            .orderBy(...orderClauses)
            .limit(perPage)
            .offset(offset);

        let data = rows as Entry[];

        if (type && params?.populate && params.populate.length > 0) {
            const entryTypeConfig = config.entries[type];
            if (entryTypeConfig) {
                data = await populateEntries(getDb(), data, entryTypeConfig.fieldGroups, params.populate);
            }
        }

        return {
            data,
            pagination: { page, limit: perPage, total, pages },
        };
    },

    async get(id: string, options?: { populate?: string[]; locale?: string; type?: string }): Promise<Entry | null> {
        const type = options?.type;
        const conditions = [
            eq(entriesTable.id, id),
            isNull(entriesTable.deletedAt),
            ...(type ? [eq(entriesTable.type, type)] : []),
        ];

        const row = await getDb()
            .select()
            .from(entriesTable)
            .where(and(...conditions))
            .limit(1);

        if (!row[0]) {
            return null;
        }

        let result = row[0] as Entry;

        if (type && options?.populate && options.populate.length > 0) {
            const entryTypeConfig = config.entries[type];
            if (entryTypeConfig) {
                const populated = await populateEntries(
                    getDb(),
                    [result],
                    entryTypeConfig.fieldGroups,
                    options.populate
                );
                result = populated[0] || result;
            }
        }

        return result;
    },

    async create(data: {
        type: string;
        title: string;
        slug?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry> {
        const validated = validate(createEntrySchema, {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishAt: data.publishAt,
        });

        const { type } = data;
        const status = validated.status || 'draft';
        const publishedAt =
            status === 'published' ? new Date() : (validated.publishAt ?? null);

        const baseSlug = validated.slug ? validated.slug : titleToSlug(validated.title);
        const slug = await generateUniqueSlug(type, baseSlug);

        const row = await getDb()
            .insert(entriesTable)
            .values({
                type,
                title: validated.title,
                slug,
                locale: (config as { defaultLocale?: string }).defaultLocale ?? 'en',
                fields: validated.fields || {},
                status,
                publishedAt,
            })
            .returning();

        if (!(row as EntryRow[])[0]) {
            throw new Error('Failed to create entry');
        }

        const created = (row as EntryRow[])[0] as Entry;

        if (validated.fields) {
            await saveRelationships(created.id, validated.fields as JsonObject, type);
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
        const validatedData = validate(updateEntrySchema, data);

        const current = await getDb()
            .select()
            .from(entriesTable)
            .where(eq(entriesTable.id, id))
            .limit(1);

        const currentEntry = current[0];
        if (!currentEntry) {
            throw new Error('Entry not found');
        }

        const type = currentEntry.type;

        // --- Versioning ---
        if (isVersioningEnabled(type)) {
            const currentRelations = await buildRelationsSnapshot(id);
            const incomingRelations = validatedData.fields
                ? buildIncomingRelations(type, validatedData.fields as JsonObject)
                : currentRelations;

            const titleChanged =
                validatedData.title !== undefined && validatedData.title !== currentEntry.title;
            const slugChanged =
                validatedData.slug !== undefined && validatedData.slug !== currentEntry.slug;
            const fieldsChanged =
                validatedData.fields !== undefined &&
                !deepEqual(currentEntry.fields, validatedData.fields);
            const relationsChanged =
                validatedData.fields !== undefined &&
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

        let publishedAt = validatedData.publishAt;
        if (validatedData.status === 'published' && !currentEntry.publishedAt) {
            publishedAt = new Date();
        }

        // If slug is being updated, ensure uniqueness
        let slug = validatedData.slug;
        if (slug && slug !== currentEntry.slug) {
            slug = await generateUniqueSlug(type, slug, id);
        }

        const row = await getDb()
            .update(entriesTable)
            .set({
                title: validatedData.title,
                slug,
                fields: validatedData.fields as JsonObject | undefined,
                status: validatedData.status,
                publishedAt,
                updatedAt: new Date(),
            })
            .where(eq(entriesTable.id, id))
            .returning();

        if (!(row as EntryRow[])[0]) {
            throw new Error('Failed to update entry');
        }

        const updated = (row as EntryRow[])[0] as Entry;

        if (validatedData.fields) {
            await saveRelationships(updated.id, validatedData.fields as JsonObject, type);
        }

        // --- Non-translatable field propagation ---
        if (validatedData.fields) {
            const changedFieldNames = Object.keys(validatedData.fields);
            const nonTranslatableNames = getNonTranslatableFieldNames(
                type,
                changedFieldNames
            );
            if (nonTranslatableNames.length > 0) {
                const nonTranslatableValues: JsonObject = {};
                for (const name of nonTranslatableNames) {
                    nonTranslatableValues[name] = (validatedData.fields as JsonObject)[name]!;
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
        // Look up the entry to get its type for the cascade
        const row = await getDb()
            .select({ type: entriesTable.type })
            .from(entriesTable)
            .where(eq(entriesTable.id, id))
            .limit(1);

        await getDb()
            .update(entriesTable)
            .set({ deletedAt: now })
            .where(eq(entriesTable.id, id));

        if (row[0]) {
            // Cascade trash to translations
            await getDb()
                .update(entriesTable)
                .set({ deletedAt: now })
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.type, row[0].type),
                        isNull(entriesTable.deletedAt)
                    )
                );
        }
    },

    async duplicate(id: string): Promise<Entry> {
        const original = await getDb()
            .select()
            .from(entriesTable)
            .where(eq(entriesTable.id, id))
            .limit(1);

        if (!original[0]) {
            throw new Error('Entry not found');
        }

        const source = original[0] as Entry;
        const type = source.type;
        const baseSlug = source.slug
            ? `${source.slug}-copy`
            : titleToSlug(`${source.title} copy`);
        const slug = await generateUniqueSlug(type, baseSlug);

        const row = await getDb()
            .insert(entriesTable)
            .values({
                type,
                title: `${source.title} (Copy)`,
                slug,
                locale: (config as { defaultLocale?: string }).defaultLocale ?? 'en',
                fields: (source.fields as JsonObject) || {},
                status: 'draft',
                publishedAt: null,
            })
            .returning();

        if (!(row as EntryRow[])[0]) {
            throw new Error('Failed to duplicate entry');
        }

        const created = (row as EntryRow[])[0] as Entry;

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

    async restore(id: string): Promise<Entry> {
        // Look up the entry to get its type for the cascade
        const existing = await getDb()
            .select({ type: entriesTable.type })
            .from(entriesTable)
            .where(eq(entriesTable.id, id))
            .limit(1);

        const row = await getDb()
            .update(entriesTable)
            .set({ deletedAt: null, updatedAt: new Date() })
            .where(
                and(
                    eq(entriesTable.id, id),
                    isNotNull(entriesTable.deletedAt)
                )
            )
            .returning();

        if (!(row as EntryRow[])[0]) {
            throw new Error('Entry not found in trash');
        }

        if (existing[0]) {
            // Cascade restore to translations
            await getDb()
                .update(entriesTable)
                .set({ deletedAt: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.type, existing[0].type),
                        isNotNull(entriesTable.deletedAt)
                    )
                );
        }

        return (row as EntryRow[])[0] as Entry;
    },

    async delete(id: string): Promise<void> {
        const relationshipsRepo = new RelationshipsRepository(getDb());

        // Look up the entry to get its type for scoped cleanup
        const existing = await getDb()
            .select({ type: entriesTable.type })
            .from(entriesTable)
            .where(eq(entriesTable.id, id))
            .limit(1);

        if (existing[0]) {
            const type = existing[0].type;

            // Delete translations first
            const translations = await getDb()
                .select({ id: entriesTable.id })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.translationOf, id),
                        eq(entriesTable.type, type)
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
                            eq(entriesTable.type, type)
                        )
                    );
            }
        }

        await relationshipsRepo.deleteBySource(id, 'entry');

        await getDb()
            .delete(entriesTable)
            .where(eq(entriesTable.id, id));
    },

    async emptyTrash(options?: { type?: string }): Promise<void> {
        const type = options?.type;

        // Find all trashed entries to clean up relationships
        const conditions = [
            ...(type ? [eq(entriesTable.type, type)] : []),
            isNotNull(entriesTable.deletedAt),
        ];

        const trashed = await getDb()
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(and(...conditions));

        const relationshipsRepo = new RelationshipsRepository(getDb());
        for (const { id } of trashed) {
            await relationshipsRepo.deleteBySource(id, 'entry');
        }

        await getDb()
            .delete(entriesTable)
            .where(and(...conditions));
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

        const type = currentEntry.type;

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
            slug = await generateUniqueSlug(type, slug, id);
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

        if (!(updated as EntryRow[])[0]) throw new Error('Failed to restore entry');

        // Rebuild relationship rows from version snapshot
        if (version.relations) {
            const relRepo = new RelationshipsRepository(getDb());
            for (const [fieldName, targetIds] of Object.entries(
                version.relations as Record<string, unknown>
            )) {
                const ids = Array.isArray(targetIds)
                    ? (targetIds as string[])
                    : [targetIds as string];
                // Determine target type from entry type config
                const entryTypeConfig = config.entries[type];
                let targetType: 'entry' | 'user' | 'media' = 'entry';
                if (entryTypeConfig) {
                    for (const group of entryTypeConfig.fieldGroups) {
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

        return (updated as EntryRow[])[0] as unknown as Entry;
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
        const validated = validate(createTranslationSchema, { locale, ...options });
        const copyFields = validated.copyFields ?? true;

        const source = await getDb()
            .select()
            .from(entriesTable)
            .where(
                and(
                    eq(entriesTable.id, sourceId),
                    isNull(entriesTable.deletedAt)
                )
            )
            .limit(1);

        if (!source[0]) throw new Error('Source entry not found');
        if (source[0].translationOf !== null)
            throw new Error('Source entry is itself a translation');

        const type = source[0].type;

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
                type,
                locale,
                translationOf: sourceId,
                title: sourceEntry.title,
                slug,
                fields,
                status: 'draft',
                publishedAt: null,
            })
            .returning();

        if (!(inserted as EntryRow[])[0]) throw new Error('Failed to create translation');

        const created = (inserted as EntryRow[])[0] as Entry;

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
        return entries.update(id, { status: 'published', publishAt: null });
    },

    async unpublish(id: string): Promise<Entry> {
        return entries.update(id, { status: 'draft', publishAt: null });
    },

    async schedule(id: string, publishAt: Date): Promise<Entry> {
        const validated = validate(scheduleEntrySchema, { publishAt });
        return entries.update(id, { status: 'scheduled', publishAt: validated.publishAt });
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

