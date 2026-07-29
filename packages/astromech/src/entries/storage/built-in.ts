/**
 * Built-in entry storage — the default persistence backend.
 *
 * Owns row CRUD on `entries`, list filters/search/sort/pagination, slug
 * uniquification, status/publishedAt column writes, the trash/versions/
 * translatable capability groups, locale-map enrichment, and Kysely transactions.
 * Policy (validation, hooks, relationships, versioning *decisions*, bulk
 * dispatch) stays in the entries service.
 *
 * No `virtual:astromech/config` import — this stays directly testable. Calls
 * `getDb()` per-op like the original data layer; `transaction` rebinds a fresh
 * instance to the Kysely tx handle.
 */

import type { ExpressionBuilder, Insertable, Updateable } from 'kysely';
import { getDb } from '@/database/registry.js';
import { supportsTransactions } from '@/database/capabilities.js';
import { encode, encodePatch, decode } from '@/database/codec.js';
import type { DB, Db } from '@/database/types.js';
import type { EntryRow } from '../schema.js';
import { createVersionStorage } from './versions.js';
import type {
    Entry,
    EntryStatus,
    EntryVersion,
    JsonObject,
    SortOption,
} from '@/types/index.js';
import { BUILT_IN_SUPPORTS } from './capabilities.js';
import type {
    Capability,
    EntryStorage,
    EntryWrite,
    ListParams,
    NewEntryVersionSnapshot,
} from './types.js';

// ============================================================================
// Query helpers
// ============================================================================

const SORTABLE_FIELDS = new Set([
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'slug',
]);

type OrderPair = [col: keyof DB['entries'] & string, dir: 'asc' | 'desc'];

function buildOrderBy(sort?: SortOption | SortOption[]): OrderPair[] {
    if (!sort) return [['createdAt', 'desc']];

    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses: OrderPair[] = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!SORTABLE_FIELDS.has(field)) return [];
            return [[field, dir === 'asc' ? 'asc' : 'desc']] as OrderPair[];
        })
    );

    return clauses.length > 0 ? clauses : [['createdAt', 'desc']];
}

function buildListWhere(params: ListParams, defaultLocale: string, types: string[]) {
    return (eb: ExpressionBuilder<DB, 'entries'>) => {
        const conditions = [];

        // type condition
        const [firstType] = types;
        if (types.length === 1 && firstType !== undefined) {
            conditions.push(eb('type', '=', firstType));
        } else {
            conditions.push(eb('type', 'in', types));
        }

        // Staged rows (forward versioning) are never canonical content
        conditions.push(eb('stagedFor', 'is', null));

        // trash filter
        const trashed = params.trashed ?? false;
        if (trashed) {
            conditions.push(eb('deletedAt', 'is not', null));
        } else {
            conditions.push(eb('deletedAt', 'is', null));
        }

        // locale condition
        const localeVal = params.locale;
        if (localeVal !== 'all') {
            conditions.push(eb('locale', '=', localeVal ?? defaultLocale));
        }

        // search
        if (params.search) {
            const term = `%${params.search}%`;
            conditions.push(eb.or([eb('title', 'like', term), eb('slug', 'like', term)]));
        }

        // where filters
        if (params.where) {
            for (const [key, value] of Object.entries(params.where)) {
                if (value === undefined || value === null) continue;
                if (key === 'locale') continue; // handled above

                if (key === '_search') {
                    conditions.push(eb('title', 'like', `%${value as string}%`));
                } else if (key === 'status') {
                    if (Array.isArray(value)) {
                        conditions.push(eb('status', 'in', value as EntryStatus[]));
                    } else {
                        conditions.push(eb('status', '=', value as EntryStatus));
                    }
                } else if (key === 'slug') {
                    conditions.push(eb('slug', '=', value as string));
                } else if (key === 'title') {
                    conditions.push(eb('title', '=', value as string));
                } else if (key === 'id') {
                    const inClause = (value as { in?: unknown }).in;
                    if (Array.isArray(inClause)) {
                        conditions.push(eb('id', 'in', inClause as string[]));
                    } else {
                        conditions.push(eb('id', '=', value as string));
                    }
                }
            }
        }

        return eb.and(conditions);
    };
}

// ============================================================================
// Locale-map enrichment
// ============================================================================

async function populateLocales(db: Db, rows: EntryRow[]): Promise<Entry[]> {
    if (rows.length === 0) return [];

    const groupIds = Array.from(new Set(rows.map((r) => r.localeGroup)));
    const siblings = await db
        .selectFrom('entries')
        .select(['id', 'locale', 'localeGroup'])
        .where((eb) =>
            eb.and([eb('localeGroup', 'in', groupIds), eb('deletedAt', 'is', null)])
        )
        .execute();

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

export function createBuiltInEntryStorage(opts?: { db?: Db; defaultLocale?: string }) {
    const dbOverride = opts?.db;
    const defaultLocale = opts?.defaultLocale ?? 'en';

    const handle = (): Db => dbOverride ?? getDb();

    const supports: readonly Capability[] = BUILT_IN_SUPPORTS;

    async function transaction<T>(
        fn: (storage: EntryStorage<Entry>, db: Db) => Promise<T>
    ): Promise<T> {
        return getDb()
            .transaction()
            .execute(async (trx) => {
                const txStorage = createBuiltInEntryStorage({ db: trx, defaultLocale });
                return fn(txStorage, trx);
            });
    }

    async function uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string> {
        const db = handle();
        let candidate = baseSlug;
        let counter = 1;

        while (true) {
            const existing = await db
                .selectFrom('entries')
                .select('id')
                .where((eb) => {
                    const conditions = [
                        eb('type', '=', type),
                        eb('locale', '=', locale),
                        eb('slug', '=', candidate),
                        eb('deletedAt', 'is', null),
                        // Staged rows legitimately share their canonical's slug; they are
                        // outside the (partial) slug unique index, so ignore them here.
                        eb('stagedFor', 'is', null),
                        ...(excludeId ? [eb('id', '!=', excludeId)] : []),
                    ];
                    return eb.and(conditions);
                })
                .limit(1)
                .execute();

            if (!existing[0]) return candidate;

            counter++;
            candidate = `${baseSlug}-${counter}`;
        }
    }

    async function list(params: ListParams): Promise<{ data: Entry[]; total: number }> {
        const db = handle();
        const typeParam = params.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : [typeParam as string];
        const limit = params.limit;
        const page = params.page ?? 1;

        const orderPairs = buildOrderBy(params.sort);
        const whereFn = buildListWhere(params, defaultLocale, types);

        if (limit === 'all') {
            let q = db.selectFrom('entries').selectAll().where(whereFn);
            for (const [col, dir] of orderPairs) {
                q = q.orderBy(col, dir);
            }
            const rawRows = await q.execute();
            const decodedRows = rawRows.map((r) =>
                decode('entries', r)
            ) as unknown as EntryRow[];
            const data = await populateLocales(db, decodedRows);
            return { data, total: data.length };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const cr = await db
            .selectFrom('entries')
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where(whereFn)
            .executeTakeFirst();
        const total = Number(cr?.c ?? 0);

        let rowsQ = db
            .selectFrom('entries')
            .selectAll()
            .where(whereFn)
            .limit(perPage)
            .offset(offset);
        for (const [col, dir] of orderPairs) {
            rowsQ = rowsQ.orderBy(col, dir);
        }
        const rawRows = await rowsQ.execute();
        const decodedRows = rawRows.map((r) =>
            decode('entries', r)
        ) as unknown as EntryRow[];
        const data = await populateLocales(db, decodedRows);
        return { data, total };
    }

    async function get(
        id: string,
        opts?: { includeTrashed?: boolean }
    ): Promise<Entry | null> {
        const db = handle();
        let q = db.selectFrom('entries').selectAll().where('id', '=', id);
        if (!opts?.includeTrashed) {
            q = q.where('deletedAt', 'is', null);
        }
        const row = await q.limit(1).executeTakeFirst();
        if (!row) return null;
        return populateLocaleSingle(db, decode('entries', row) as unknown as EntryRow);
    }

    async function create(data: EntryWrite & { type: string }): Promise<Entry> {
        const db = handle();
        const values = {
            type: data.type,
            title: data.title ?? '',
            slug: data.slug ?? null,
            locale: data.locale ?? defaultLocale,
            localeGroup: data.localeGroup ?? crypto.randomUUID(),
            fields: data.fields ?? {},
            status: data.status ?? 'unpublished',
            stagedFor: data.stagedFor ?? null,
            publishedAt: data.publishedAt ?? null,
            createdBy: data.createdBy ?? null,
            updatedBy: data.updatedBy ?? null,
        };
        const created = await db
            .insertInto('entries')
            .values(encode('entries', values) as unknown as Insertable<DB['entries']>)
            .returningAll()
            .executeTakeFirstOrThrow();
        return populateLocaleSingle(
            db,
            decode('entries', created) as unknown as EntryRow
        );
    }

    async function update(id: string, data: EntryWrite): Promise<Entry> {
        const db = handle();
        const patch = {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
            locale: data.locale,
            localeGroup: data.localeGroup,
            updatedBy: data.updatedBy,
            updatedAt: new Date(),
        };
        const updated = await db
            .updateTable('entries')
            .set(encodePatch('entries', patch) as unknown as Updateable<DB['entries']>)
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirstOrThrow();
        return populateLocaleSingle(
            db,
            decode('entries', updated) as unknown as EntryRow
        );
    }

    async function del(id: string, opts?: { cascadeLocales?: boolean }): Promise<void> {
        const db = handle();
        if (opts?.cascadeLocales) {
            const existing = await db
                .selectFrom('entries')
                .select('localeGroup')
                .where('id', '=', id)
                .limit(1)
                .executeTakeFirst();
            const localeGroup = existing?.localeGroup;
            if (localeGroup) {
                await db
                    .deleteFrom('entries')
                    .where('localeGroup', '=', localeGroup)
                    .execute();
                return;
            }
        }
        await db.deleteFrom('entries').where('id', '=', id).execute();
    }

    const trash = {
        trash: async (id: string, opts?: { cascadeLocales?: boolean }): Promise<void> => {
            const db = handle();
            const row = await db
                .selectFrom('entries')
                .select(['localeGroup', 'deletedAt'])
                .where('id', '=', id)
                .limit(1)
                .executeTakeFirst();
            if (!row) throw new Error(`Entry '${id}' not found`);
            const now = new Date();

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt == null) {
                await db
                    .updateTable('entries')
                    .set(
                        encodePatch('entries', {
                            deletedAt: now,
                        }) as unknown as Updateable<DB['entries']>
                    )
                    .where('id', '=', id)
                    .execute();
            }

            if (opts?.cascadeLocales) {
                await db
                    .updateTable('entries')
                    .set(
                        encodePatch('entries', {
                            deletedAt: now,
                        }) as unknown as Updateable<DB['entries']>
                    )
                    .where((eb) =>
                        eb.and([
                            eb('localeGroup', '=', row.localeGroup),
                            eb('id', '!=', id),
                            eb('deletedAt', 'is', null),
                        ])
                    )
                    .execute();
            }
        },

        restore: async (id: string): Promise<Entry> => {
            const db = handle();
            const restored = await db
                .updateTable('entries')
                .set(
                    encodePatch('entries', {
                        deletedAt: null,
                        updatedAt: new Date(),
                    }) as unknown as Updateable<DB['entries']>
                )
                .where((eb) =>
                    eb.and([eb('id', '=', id), eb('deletedAt', 'is not', null)])
                )
                .returningAll()
                .executeTakeFirstOrThrow();
            return populateLocaleSingle(
                db,
                decode('entries', restored) as unknown as EntryRow
            );
        },

        emptyTrash: async (type: string): Promise<void> => {
            const db = handle();
            await db
                .deleteFrom('entries')
                .where((eb) =>
                    eb.and([eb('type', '=', type), eb('deletedAt', 'is not', null)])
                )
                .execute();
        },
    };

    const versions = {
        list: async (entryId: string): Promise<EntryVersion[]> => {
            const rows = await createVersionStorage(handle()).list(entryId);
            return rows as unknown as EntryVersion[];
        },

        get: async (versionId: string): Promise<EntryVersion | null> => {
            const row = await createVersionStorage(handle()).get(versionId);
            return (row as unknown as EntryVersion) ?? null;
        },

        create: async (snapshot: NewEntryVersionSnapshot): Promise<void> => {
            await createVersionStorage(handle()).create({
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
            return createVersionStorage(handle()).getLatestNumber(entryId);
        },
    };

    const staging = {
        getByCanonical: async (canonicalId: string): Promise<Entry | null> => {
            const db = handle();
            const row = await db
                .selectFrom('entries')
                .selectAll()
                .where((eb) =>
                    eb.and([
                        eb('stagedFor', '=', canonicalId),
                        eb('deletedAt', 'is', null),
                    ])
                )
                .limit(1)
                .executeTakeFirst();
            if (!row) return null;
            return populateLocaleSingle(
                db,
                decode('entries', row) as unknown as EntryRow
            );
        },
    };

    const translatable = {
        siblings: async (localeGroup: string, excludeId?: string): Promise<Entry[]> => {
            const db = handle();
            const rawRows = await db
                .selectFrom('entries')
                .selectAll()
                .where((eb) => {
                    const conditions = [
                        eb('localeGroup', '=', localeGroup),
                        eb('deletedAt', 'is', null),
                        ...(excludeId ? [eb('id', '!=', excludeId)] : []),
                    ];
                    return eb.and(conditions);
                })
                .execute();
            const decodedRows = rawRows.map((r) =>
                decode('entries', r)
            ) as unknown as EntryRow[];
            return populateLocales(db, decodedRows);
        },

        propagateFields: async (
            localeGroup: string,
            excludeId: string,
            values: JsonObject
        ): Promise<void> => {
            const db = handle();
            const siblings = await db
                .selectFrom('entries')
                .select(['id', 'fields'])
                .where((eb) =>
                    eb.and([
                        eb('localeGroup', '=', localeGroup),
                        eb('id', '!=', excludeId),
                        eb('deletedAt', 'is', null),
                    ])
                )
                .execute();

            for (const sibling of siblings) {
                const existingFields: JsonObject =
                    typeof sibling.fields === 'string'
                        ? (JSON.parse(sibling.fields) as JsonObject)
                        : {};
                const mergedFields = { ...existingFields, ...values };
                await db
                    .updateTable('entries')
                    .set(
                        encodePatch('entries', {
                            fields: mergedFields,
                            updatedAt: new Date(),
                        }) as unknown as Updateable<DB['entries']>
                    )
                    .where('id', '=', sibling.id)
                    .execute();
            }
        },
    };

    return {
        supports,
        // `EntryStorage.transaction` is optional and every caller
        // (operations/create.ts, internal/bulk.ts, operations/staging/merge.ts)
        // already falls back to sequential writes, so omitting it on a driver
        // without interactive transactions degrades correctly instead of
        // throwing at runtime.
        ...(supportsTransactions() ? { transaction } : {}),
        uniqueSlug,
        list,
        get,
        create,
        update,
        delete: del,
        trash,
        versions,
        staging,
        translatable,
    } satisfies EntryStorage<Entry>;
}
