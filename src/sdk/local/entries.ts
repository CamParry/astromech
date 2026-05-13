/**
 * Astromech Server Entries API
 *
 * Unified entries object for direct database access in Astro server-side code.
 * Import from 'astromech/local'.
 *
 * Surface: see specs/typed-entries-api.md (options-object shape, type required
 * on every call, bulk-capable methods accept `id: string | string[]`).
 * Locale model: see specs/symmetric-locale-model.md.
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
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import { getDb } from '@/db/registry.js';
import { entriesTable } from '@/db/schema.js';
import type { EntryRow } from '@/db/schema.js';
import { ValidationError } from '@/errors/validation.js';
import { EntryTypeMismatchError } from '@/errors/entry-type-mismatch.js';
import { BulkOperationError } from '@/errors/bulk-operation.js';
import {
    createEntrySchema,
    updateEntrySchema,
    scheduleEntrySchema,
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
    EntryUpdateData,
    EntryDuplicateOverrides,
    IncomingRelation,
    QueryResult,
    JsonObject,
    SortOption,
    User,
    WhereFilters,
} from '@/types/index.js';
import { setCurrentUser } from '@/sdk/local/context.js';
import { titleToSlug } from '@/support/strings.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

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

function getDefaultLocale(): string {
    return (config as { defaultLocale?: string }).defaultLocale ?? 'en';
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

export async function generateUniqueSlug(
    type: string,
    locale: string,
    baseSlug: string,
    excludeId?: string,
    db: Db = getDb()
): Promise<string> {
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
        const conditions = [
            eq(entriesTable.type, type),
            eq(entriesTable.locale, locale),
            eq(entriesTable.slug, candidate),
            isNull(entriesTable.deletedAt),
            ...(excludeId ? [ne(entriesTable.id, excludeId)] : []),
        ];

        const existing = await db
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(and(...conditions))
            .limit(1);

        if (!existing[0]) return candidate;

        counter++;
        candidate = `${baseSlug}-${counter}`;
    }
}

// ============================================================================
// locales map population
// ============================================================================

async function populateLocales<T extends EntryRow>(rows: T[], db: Db = getDb()): Promise<Entry[]> {
    if (rows.length === 0) return [] as Entry[];

    const groupIds = Array.from(new Set(rows.map((r) => r.localeGroup)));
    const siblings = await db
        .select({
            id: entriesTable.id,
            locale: entriesTable.locale,
            localeGroup: entriesTable.localeGroup,
        })
        .from(entriesTable)
        .where(and(inArray(entriesTable.localeGroup, groupIds), isNull(entriesTable.deletedAt)));

    const byGroup = new Map<string, Record<string, string>>();
    for (const sib of siblings) {
        let map = byGroup.get(sib.localeGroup);
        if (!map) {
            map = {};
            byGroup.set(sib.localeGroup, map);
        }
        map[sib.locale] = sib.id;
    }

    return rows.map((row) => ({
        ...(row as unknown as Entry),
        locales: byGroup.get(row.localeGroup) ?? { [row.locale]: row.id },
    }));
}

async function populateLocaleSingle<T extends EntryRow>(row: T, db: Db = getDb()): Promise<Entry> {
    const populated = await populateLocales([row], db);
    return populated[0]!;
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
            // Handled by buildLocaleCondition at the top level — ignore here.
        } else if (key === 'id') {
            const inClause = (value as { in?: unknown }).in;
            if (Array.isArray(inClause)) {
                conditions.push(inArray(entriesTable.id, inClause as string[]));
            } else {
                conditions.push(eq(entriesTable.id, value as string));
            }
        }
    }

    return conditions;
}

// ============================================================================
// Relationship + version helpers
// ============================================================================

async function saveRelationships(
    db: Db,
    entryId: string,
    fields: JsonObject,
    typeName: string
): Promise<void> {
    const relationshipsRepo = new RelationshipsRepository(db);
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
    db: Db,
    entryId: string
): Promise<Record<string, string | string[]>> {
    const relRepo = new RelationshipsRepository(db);
    const rels = await relRepo.getBySource(entryId, 'entry');
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

function buildLocaleCondition(locale: string | 'all' | undefined) {
    if (locale === 'all') return null;
    return eq(entriesTable.locale, locale ?? getDefaultLocale());
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
// Type-mismatch enforcement helper
// ============================================================================

async function loadAndAssertType(
    db: Db,
    type: string,
    id: string
): Promise<EntryRow> {
    const rows = await db
        .select()
        .from(entriesTable)
        .where(eq(entriesTable.id, id))
        .limit(1);
    const row = rows[0] as EntryRow | undefined;
    if (!row) throw new Error(`Entry '${id}' not found`);
    if (row.type !== type) {
        throw new EntryTypeMismatchError({
            entryId: id,
            expectedType: type,
            actualType: row.type,
        });
    }
    return row;
}

// ============================================================================
// Bulk dispatch helper
// ============================================================================

async function runBulk<T>(
    ids: readonly string[],
    perId: (db: Db, id: string) => Promise<T>
): Promise<T[]> {
    if (ids.length === 0) return [];
    return getDb().transaction(async (tx) => {
        const results: T[] = [];
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                results.push(await perId(tx as unknown as Db, id));
                succeeded.push(id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return results;
    });
}

async function runBulkVoid(
    ids: readonly string[],
    perId: (db: Db, id: string) => Promise<void>
): Promise<void> {
    if (ids.length === 0) return;
    await getDb().transaction(async (tx) => {
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                await perId(tx as unknown as Db, id);
                succeeded.push(id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
    });
}

// ============================================================================
// Internal per-id operations
// ============================================================================

async function _updateOne(
    db: Db,
    type: string,
    id: string,
    data: EntryUpdateData
): Promise<Entry> {
    const validatedData = validate(updateEntrySchema, data);
    const currentEntry = await loadAndAssertType(db, type, id);

    if (isVersioningEnabled(type)) {
        const currentRelations = await buildRelationsSnapshot(db, id);
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
            const versionsRepo = new VersionsRepository(db);
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

    let slug = validatedData.slug;
    if (slug && slug !== currentEntry.slug) {
        slug = await generateUniqueSlug(type, currentEntry.locale, slug, id, db);
    }

    const row = await db
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

    if (!(row as EntryRow[])[0]) throw new Error('Failed to update entry');
    const updated = (row as EntryRow[])[0]!;

    if (validatedData.fields) {
        await saveRelationships(db, updated.id, validatedData.fields as JsonObject, type);
    }

    if (validatedData.fields) {
        const changedFieldNames = Object.keys(validatedData.fields);
        const nonTranslatableNames = getNonTranslatableFieldNames(type, changedFieldNames);
        if (nonTranslatableNames.length > 0) {
            const nonTranslatableValues: JsonObject = {};
            for (const name of nonTranslatableNames) {
                nonTranslatableValues[name] = (validatedData.fields as JsonObject)[name]!;
            }

            const siblings = await db
                .select({ id: entriesTable.id, fields: entriesTable.fields })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.localeGroup, currentEntry.localeGroup),
                        ne(entriesTable.id, id),
                        isNull(entriesTable.deletedAt)
                    )
                );

            for (const sibling of siblings) {
                const mergedFields = {
                    ...((sibling.fields as JsonObject) ?? {}),
                    ...nonTranslatableValues,
                };
                await db
                    .update(entriesTable)
                    .set({ fields: mergedFields, updatedAt: new Date() })
                    .where(eq(entriesTable.id, sibling.id));
            }
        }
    }

    return populateLocaleSingle(updated, db);
}

async function _trashOne(
    db: Db,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    const row = await loadAndAssertType(db, type, id);
    const now = new Date();

    // Idempotent: re-trashing an already-trashed entry is a no-op.
    if (row.deletedAt == null) {
        await db
            .update(entriesTable)
            .set({ deletedAt: now })
            .where(eq(entriesTable.id, id));
    }

    if (cascadeLocales) {
        await db
            .update(entriesTable)
            .set({ deletedAt: now })
            .where(
                and(
                    eq(entriesTable.localeGroup, row.localeGroup),
                    ne(entriesTable.id, id),
                    isNull(entriesTable.deletedAt)
                )
            );
    }
}

async function _deleteOne(
    db: Db,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    const existing = await loadAndAssertType(db, type, id);
    const relationshipsRepo = new RelationshipsRepository(db);

    if (cascadeLocales) {
        const siblings = await db
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(
                and(
                    eq(entriesTable.localeGroup, existing.localeGroup),
                    ne(entriesTable.id, id)
                )
            );

        for (const sib of siblings) {
            await relationshipsRepo.deleteByEntry(sib.id);
        }
        await relationshipsRepo.deleteByEntry(id);

        // Versions cascade-delete via entry_versions.entry_id ON DELETE CASCADE.
        await db
            .delete(entriesTable)
            .where(eq(entriesTable.localeGroup, existing.localeGroup));
        return;
    }

    await relationshipsRepo.deleteByEntry(id);
    await db.delete(entriesTable).where(eq(entriesTable.id, id));
}

async function _restoreOne(db: Db, type: string, id: string): Promise<Entry> {
    await loadAndAssertType(db, type, id);
    const row = await db
        .update(entriesTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(entriesTable.id, id), isNotNull(entriesTable.deletedAt)))
        .returning();

    if (!(row as EntryRow[])[0]) {
        throw new Error('Entry not found in trash');
    }
    return populateLocaleSingle((row as EntryRow[])[0]!, db);
}

// ============================================================================
// Entries API
// ============================================================================

export const entries: EntriesApi = {
    async query(params: EntryQueryParams & { type: string | readonly string[] }): Promise<QueryResult<Entry>> {
        const typeParam = params.type;
        const types = Array.isArray(typeParam) ? Array.from(typeParam) : [typeParam as string];
        const trashed = params.trashed ?? false;
        const limit = params.limit;
        const page = params.page ?? 1;

        const filterConditions = params.where
            ? buildFilterConditions(params.where)
            : [];
        const localeCondition = buildLocaleCondition(params.locale);
        const searchCondition = params.search
            ? like(entriesTable.title, `%${params.search}%`)
            : null;

        const typeCondition =
            types.length === 1
                ? eq(entriesTable.type, types[0]!)
                : inArray(entriesTable.type, types);

        const conditions = [
            typeCondition,
            trashed ? isNotNull(entriesTable.deletedAt) : isNull(entriesTable.deletedAt),
            ...(localeCondition ? [localeCondition] : []),
            ...(searchCondition ? [searchCondition] : []),
            ...filterConditions,
        ];

        const whereClause = and(...conditions);
        const orderClauses = buildOrderBy(params.sort);

        // Populate only applies when all rows share a single type config.
        const singleType = types.length === 1 ? types[0]! : null;

        if (limit === 'all') {
            const rows = await getDb()
                .select()
                .from(entriesTable)
                .where(whereClause)
                .orderBy(...orderClauses);

            let data = await populateLocales(rows as EntryRow[]);

            if (singleType && params.populate && params.populate.length > 0) {
                const entryTypeConfig = config.entries[singleType];
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

        let data = await populateLocales(rows as EntryRow[]);

        if (singleType && params.populate && params.populate.length > 0) {
            const entryTypeConfig = config.entries[singleType];
            if (entryTypeConfig) {
                data = await populateEntries(getDb(), data, entryTypeConfig.fieldGroups, params.populate);
            }
        }

        return {
            data,
            pagination: { page, limit: perPage, total, pages },
        };
    },

    async get(params: {
        type: string;
        id: string;
        locale?: string;
        populate?: string[];
    }): Promise<Entry | null> {
        const { type, id } = params;
        const conditions = [
            eq(entriesTable.id, id),
            isNull(entriesTable.deletedAt),
            eq(entriesTable.type, type),
        ];

        const row = await getDb()
            .select()
            .from(entriesTable)
            .where(and(...conditions))
            .limit(1);

        if (!row[0]) return null;

        let result: Entry = await populateLocaleSingle(row[0] as EntryRow);

        if (params.populate && params.populate.length > 0) {
            const entryTypeConfig = config.entries[type];
            if (entryTypeConfig) {
                const populated = await populateEntries(
                    getDb(),
                    [result],
                    entryTypeConfig.fieldGroups,
                    params.populate
                );
                result = populated[0] || result;
            }
        }

        return result;
    },

    async create(params: {
        type: string;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry> {
        const validated = validate(createEntrySchema, {
            title: params.title,
            slug: params.slug,
            fields: params.fields,
            status: params.status,
            publishAt: params.publishAt,
        });

        const { type } = params;
        const status = validated.status || 'draft';
        const publishedAt =
            status === 'published' ? new Date() : (validated.publishAt ?? null);

        const locale = params.locale ?? getDefaultLocale();
        const localeGroup = params.localeGroup ?? crypto.randomUUID();

        const baseSlug = validated.slug ? validated.slug : titleToSlug(validated.title);
        const slug = await generateUniqueSlug(type, locale, baseSlug);

        const row = await getDb()
            .insert(entriesTable)
            .values({
                type,
                title: validated.title,
                slug,
                locale,
                localeGroup,
                fields: validated.fields || {},
                status,
                publishedAt,
            })
            .returning();

        if (!(row as EntryRow[])[0]) throw new Error('Failed to create entry');

        const created = (row as EntryRow[])[0]!;

        if (validated.fields) {
            await saveRelationships(getDb(), created.id, validated.fields as JsonObject, type);
        }

        return populateLocaleSingle(created);
    },

    update: (async (params: {
        type: string;
        id: string | readonly string[];
        data: EntryUpdateData;
    }): Promise<Entry | Entry[]> => {
        if (Array.isArray(params.id)) {
            if (params.data.slug !== undefined) {
                throw new Error(
                    'Bulk update cannot set `slug`: a single value across multiple ids ' +
                        'would violate (type, locale) slug uniqueness. Update slugs individually.'
                );
            }
            return runBulk(params.id, (tx, id) => _updateOne(tx, params.type, id, params.data));
        }
        return _updateOne(getDb(), params.type, params.id as string, params.data);
    }) as EntriesApi['update'],

    async duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry> {
        const { type, id, overrides } = params;
        const source = await loadAndAssertType(getDb(), type, id);

        const locale = overrides?.locale ?? source.locale;
        const localeGroup = overrides?.localeGroup ?? crypto.randomUUID();
        const status = overrides?.status ?? 'draft';
        const title = overrides?.title ?? source.title;
        const mergedFields: JsonObject = {
            ...((source.fields as JsonObject) ?? {}),
            ...(overrides?.fields ?? {}),
        };

        const baseSlug = overrides?.slug ?? source.slug;
        const slug = baseSlug ? await generateUniqueSlug(type, locale, baseSlug) : null;

        const row = await getDb()
            .insert(entriesTable)
            .values({
                type,
                title,
                slug,
                locale,
                localeGroup,
                fields: mergedFields,
                status,
                publishedAt: status === 'published' ? new Date() : null,
            })
            .returning();

        if (!(row as EntryRow[])[0]) throw new Error('Failed to duplicate entry');
        const created = (row as EntryRow[])[0]!;

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

        return populateLocaleSingle(created);
    },

    async trash(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void> {
        const cascade = !!params.cascadeLocales;
        if (Array.isArray(params.id)) {
            return runBulkVoid(params.id, (tx, id) =>
                _trashOne(tx, params.type, id, cascade)
            );
        }
        await _trashOne(getDb(), params.type, params.id as string, cascade);
    },

    restore: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        if (Array.isArray(params.id)) {
            return runBulk(params.id, (tx, id) => _restoreOne(tx, params.type, id));
        }
        return _restoreOne(getDb(), params.type, params.id as string);
    }) as EntriesApi['restore'],

    async delete(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void> {
        const cascade = !!params.cascadeLocales;
        if (Array.isArray(params.id)) {
            return runBulkVoid(params.id, (tx, id) =>
                _deleteOne(tx, params.type, id, cascade)
            );
        }
        await _deleteOne(getDb(), params.type, params.id as string, cascade);
    },

    async emptyTrash(params: { type: string }): Promise<void> {
        const { type } = params;
        const conditions = [
            eq(entriesTable.type, type),
            isNotNull(entriesTable.deletedAt),
        ];

        const trashed = await getDb()
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(and(...conditions));

        const relationshipsRepo = new RelationshipsRepository(getDb());
        for (const { id } of trashed) {
            await relationshipsRepo.deleteByEntry(id);
        }

        await getDb().delete(entriesTable).where(and(...conditions));
    },

    async versions(params: { type: string; id: string }): Promise<EntryVersion[]> {
        await loadAndAssertType(getDb(), params.type, params.id);
        const versionsRepo = new VersionsRepository(getDb());
        const rows = await versionsRepo.list(params.id);
        return rows as unknown as EntryVersion[];
    },

    async restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
    }): Promise<Entry> {
        const { type, id, versionId } = params;
        const db = getDb();
        const versionsRepo = new VersionsRepository(db);
        const version = await versionsRepo.get(versionId);
        if (!version || version.entryId !== id) {
            throw new Error('Version not found');
        }

        const currentEntry = await loadAndAssertType(db, type, id);

        const currentRelations = await buildRelationsSnapshot(db, id);
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

        let slug = version.slug;
        if (slug && slug !== currentEntry.slug) {
            slug = await generateUniqueSlug(type, currentEntry.locale, slug, id);
        }

        const updated = await db
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

        if (version.relations) {
            const relRepo = new RelationshipsRepository(db);
            for (const [fieldName, targetIds] of Object.entries(
                version.relations as Record<string, unknown>
            )) {
                const ids = Array.isArray(targetIds)
                    ? (targetIds as string[])
                    : [targetIds as string];
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

        return populateLocaleSingle((updated as EntryRow[])[0]!);
    },

    async incomingRelations(params: {
        type: string;
        id: string;
    }): Promise<IncomingRelation[]> {
        await loadAndAssertType(getDb(), params.type, params.id);
        const relRepo = new RelationshipsRepository(getDb());
        const rels = await relRepo.getByTarget(params.id, 'entry');
        const entryRels = rels.filter((r) => r.sourceType === 'entry');
        if (entryRels.length === 0) return [];

        const sourceIds = Array.from(new Set(entryRels.map((r) => r.sourceId)));
        const sources = await getDb()
            .select({
                id: entriesTable.id,
                title: entriesTable.title,
                type: entriesTable.type,
            })
            .from(entriesTable)
            .where(inArray(entriesTable.id, sourceIds));

        const byId = new Map(sources.map((s) => [s.id, s]));
        return entryRels
            .map((rel) => {
                const src = byId.get(rel.sourceId);
                if (!src) return null;
                return {
                    sourceId: src.id,
                    sourceTitle: src.title,
                    sourceType: src.type,
                    name: rel.name,
                } satisfies IncomingRelation;
            })
            .filter((x): x is IncomingRelation => x !== null);
    },

    publish: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'published', publishAt: null },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['publish'],

    unpublish: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'draft', publishAt: null },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['unpublish'],

    schedule: (async (params: {
        type: string;
        id: string | readonly string[];
        publishAt: Date;
    }): Promise<Entry | Entry[]> => {
        const validated = validate(scheduleEntrySchema, { publishAt: params.publishAt });
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'scheduled', publishAt: validated.publishAt },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['schedule'],
};
