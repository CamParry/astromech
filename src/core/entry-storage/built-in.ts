/**
 * Built-in entry storage — the default persistence backend.
 *
 * Owns row CRUD on `entriesTable`, list filters/search/sort/pagination, slug
 * uniquification, status/publishedAt column writes, the trash/versions/
 * translatable sub-surfaces, locale-map enrichment, and drizzle transactions.
 * Policy (validation, hooks, relationships, versioning *decisions*, bulk
 * dispatch) stays in the orchestrator.
 *
 * No `virtual:astromech/config` import — this stays directly testable. Calls
 * `getDb()` per-op like the original data layer; `transaction` rebinds a fresh
 * instance to the drizzle tx handle.
 */

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
import { getDb } from '@/db/registry.js';
import { entriesTable } from '@/db/schema.js';
import type { EntryRow } from '@/db/schema.js';
import { VersionsRepository } from '@/db/repositories/versions.js';
import type {
    Entry,
    EntryStatus,
    EntryVersion,
    JsonObject,
    SortOption,
    WhereFilters,
} from '@/types/index.js';
import { BUILT_IN_SUPPORTS } from './capabilities.js';
import type {
    Capability,
    EntryStorage,
    EntryWrite,
    ListParams,
    NewEntryVersionSnapshot,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

// ============================================================================
// Query helpers (moved verbatim from the data layer)
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
        Object.entries(s).flatMap(([field, dir]) => {
            const column = SORTABLE_FIELDS[field];
            if (!column) return [];
            return [dir === 'asc' ? asc(column) : desc(column)];
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

function buildLocaleCondition(locale: string | 'all' | undefined, defaultLocale: string) {
    if (locale === 'all') return null;
    return eq(entriesTable.locale, locale ?? defaultLocale);
}

// ============================================================================
// Locale-map enrichment
// ============================================================================

async function populateLocales(db: Db, rows: EntryRow[]): Promise<Entry[]> {
    if (rows.length === 0) return [];

    const groupIds = Array.from(new Set(rows.map((r) => r.localeGroup)));
    const siblings = await db
        .select({
            id: entriesTable.id,
            locale: entriesTable.locale,
            localeGroup: entriesTable.localeGroup,
        })
        .from(entriesTable)
        .where(
            and(
                inArray(entriesTable.localeGroup, groupIds),
                isNull(entriesTable.deletedAt)
            )
        );

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

async function populateLocaleSingle(db: Db, row: EntryRow): Promise<Entry> {
    const [populated] = await populateLocales(db, [row]);
    if (!populated) throw new Error('Failed to populate entry');
    return populated;
}

// ============================================================================
// BuiltInEntryStorage
// ============================================================================

export class BuiltInEntryStorage implements EntryStorage<Entry> {
    public readonly supports: readonly Capability[] = BUILT_IN_SUPPORTS;

    private readonly dbOverride: Db | undefined;
    private readonly defaultLocale: string;

    constructor(opts?: { db?: Db; defaultLocale?: string }) {
        this.dbOverride = opts?.db;
        this.defaultLocale = opts?.defaultLocale ?? 'en';
    }

    private get db(): Db {
        return this.dbOverride ?? getDb();
    }

    async transaction<T>(
        fn: (storage: EntryStorage<Entry>, db: Db) => Promise<T>
    ): Promise<T> {
        return this.db.transaction(async (tx) => {
            const txDb = tx as unknown as Db;
            const txStorage = new BuiltInEntryStorage({
                db: txDb,
                defaultLocale: this.defaultLocale,
            });
            return fn(txStorage, txDb);
        });
    }

    async uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string> {
        const db = this.db;
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

    async list(params: ListParams): Promise<{ data: Entry[]; total: number }> {
        const db = this.db;
        const typeParam = params.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : [typeParam as string];
        const trashed = params.trashed ?? false;
        const limit = params.limit;
        const page = params.page ?? 1;

        const filterConditions = params.where ? buildFilterConditions(params.where) : [];
        const localeCondition = buildLocaleCondition(params.locale, this.defaultLocale);
        const searchCondition = params.search
            ? like(entriesTable.title, `%${params.search}%`)
            : null;

        const [firstType] = types;
        const typeCondition =
            types.length === 1 && firstType !== undefined
                ? eq(entriesTable.type, firstType)
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

        if (limit === 'all') {
            const rows = await db
                .select()
                .from(entriesTable)
                .where(whereClause)
                .orderBy(...orderClauses);
            const data = await populateLocales(db, rows as EntryRow[]);
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [countResult] = await db
            .select({ count: count() })
            .from(entriesTable)
            .where(whereClause);
        const total = countResult?.count ?? 0;

        const rows = await db
            .select()
            .from(entriesTable)
            .where(whereClause)
            .orderBy(...orderClauses)
            .limit(perPage)
            .offset(offset);
        const data = await populateLocales(db, rows as EntryRow[]);
        return { data, total };
    }

    async get(id: string, opts?: { includeTrashed?: boolean }): Promise<Entry | null> {
        const db = this.db;
        const conditions = [eq(entriesTable.id, id)];
        if (!opts?.includeTrashed) conditions.push(isNull(entriesTable.deletedAt));

        const row = await db
            .select()
            .from(entriesTable)
            .where(and(...conditions))
            .limit(1);

        if (!row[0]) return null;
        return populateLocaleSingle(db, row[0] as EntryRow);
    }

    async create(data: EntryWrite & { type: string }): Promise<Entry> {
        const db = this.db;
        const row = await db
            .insert(entriesTable)
            .values({
                type: data.type,
                title: data.title ?? '',
                slug: data.slug ?? null,
                locale: data.locale ?? this.defaultLocale,
                localeGroup: data.localeGroup ?? crypto.randomUUID(),
                fields: data.fields ?? {},
                status: data.status ?? 'draft',
                publishedAt: data.publishedAt ?? null,
                createdBy: data.createdBy ?? null,
                updatedBy: data.updatedBy ?? null,
            })
            .returning();

        const [created] = row as EntryRow[];
        if (!created) throw new Error('Failed to create entry');
        return populateLocaleSingle(db, created);
    }

    async update(id: string, data: EntryWrite): Promise<Entry> {
        const db = this.db;
        const row = await db
            .update(entriesTable)
            .set({
                title: data.title,
                slug: data.slug,
                fields: data.fields,
                status: data.status,
                publishedAt: data.publishedAt,
                locale: data.locale,
                localeGroup: data.localeGroup,
                updatedBy: data.updatedBy,
                updatedAt: new Date(),
            })
            .where(eq(entriesTable.id, id))
            .returning();

        const [updated] = row as EntryRow[];
        if (!updated) throw new Error('Failed to update entry');
        return populateLocaleSingle(db, updated);
    }

    async delete(id: string, opts?: { cascadeLocales?: boolean }): Promise<void> {
        const db = this.db;
        if (opts?.cascadeLocales) {
            const existing = await db
                .select({ localeGroup: entriesTable.localeGroup })
                .from(entriesTable)
                .where(eq(entriesTable.id, id))
                .limit(1);
            const localeGroup = existing[0]?.localeGroup;
            if (localeGroup) {
                await db
                    .delete(entriesTable)
                    .where(eq(entriesTable.localeGroup, localeGroup));
                return;
            }
        }
        await db.delete(entriesTable).where(eq(entriesTable.id, id));
    }

    trash = {
        trash: async (id: string, opts?: { cascadeLocales?: boolean }): Promise<void> => {
            const db = this.db;
            const rows = await db
                .select({
                    localeGroup: entriesTable.localeGroup,
                    deletedAt: entriesTable.deletedAt,
                })
                .from(entriesTable)
                .where(eq(entriesTable.id, id))
                .limit(1);
            const row = rows[0];
            if (!row) throw new Error(`Entry '${id}' not found`);
            const now = new Date();

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt == null) {
                await db
                    .update(entriesTable)
                    .set({ deletedAt: now })
                    .where(eq(entriesTable.id, id));
            }

            if (opts?.cascadeLocales) {
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
        },

        restore: async (id: string): Promise<Entry> => {
            const db = this.db;
            const row = await db
                .update(entriesTable)
                .set({ deletedAt: null, updatedAt: new Date() })
                .where(and(eq(entriesTable.id, id), isNotNull(entriesTable.deletedAt)))
                .returning();

            const [restored] = row as EntryRow[];
            if (!restored) throw new Error('Entry not found in trash');
            return populateLocaleSingle(db, restored);
        },

        emptyTrash: async (type: string): Promise<void> => {
            const db = this.db;
            await db
                .delete(entriesTable)
                .where(
                    and(eq(entriesTable.type, type), isNotNull(entriesTable.deletedAt))
                );
        },
    };

    versions = {
        list: async (entryId: string): Promise<EntryVersion[]> => {
            const repo = new VersionsRepository(this.db);
            const rows = await repo.list(entryId);
            return rows as unknown as EntryVersion[];
        },

        get: async (versionId: string): Promise<EntryVersion | null> => {
            const repo = new VersionsRepository(this.db);
            const row = await repo.get(versionId);
            return (row as unknown as EntryVersion) ?? null;
        },

        create: async (snapshot: NewEntryVersionSnapshot): Promise<void> => {
            const repo = new VersionsRepository(this.db);
            await repo.create({
                entryId: snapshot.entryId,
                versionNumber: snapshot.versionNumber,
                title: snapshot.title,
                slug: snapshot.slug,
                fields: snapshot.fields,
                relations: snapshot.relations,
                createdBy: snapshot.createdBy,
            });
        },

        latestNumber: async (entryId: string): Promise<number> => {
            const repo = new VersionsRepository(this.db);
            return repo.getLatestNumber(entryId);
        },
    };

    translatable = {
        siblings: async (localeGroup: string, excludeId?: string): Promise<Entry[]> => {
            const db = this.db;
            const conditions = [
                eq(entriesTable.localeGroup, localeGroup),
                isNull(entriesTable.deletedAt),
                ...(excludeId ? [ne(entriesTable.id, excludeId)] : []),
            ];
            const rows = await db
                .select()
                .from(entriesTable)
                .where(and(...conditions));
            return populateLocales(db, rows as EntryRow[]);
        },

        propagateFields: async (
            localeGroup: string,
            excludeId: string,
            values: JsonObject
        ): Promise<void> => {
            const db = this.db;
            const siblings = await db
                .select({ id: entriesTable.id, fields: entriesTable.fields })
                .from(entriesTable)
                .where(
                    and(
                        eq(entriesTable.localeGroup, localeGroup),
                        ne(entriesTable.id, excludeId),
                        isNull(entriesTable.deletedAt)
                    )
                );

            for (const sibling of siblings) {
                const mergedFields = {
                    ...((sibling.fields as JsonObject) ?? {}),
                    ...values,
                };
                await db
                    .update(entriesTable)
                    .set({ fields: mergedFields, updatedAt: new Date() })
                    .where(eq(entriesTable.id, sibling.id));
            }
        },
    };
}
