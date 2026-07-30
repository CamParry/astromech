/**
 * Built-in entry storage — the default persistence backend.
 *
 * Owns row CRUD on `entries`, list filters/search/sort/pagination, slug
 * uniquification, status/publishedAt column writes, the trash/versions/
 * translatable capability groups, locale-map enrichment, and Kysely transactions.
 * Policy (validation, hooks, relationships, versioning *decisions*, bulk
 * dispatch) stays in the entries service.
 *
 * Row access goes through `createStorage(entries)` — the descriptor-backed CRUD
 * wrapper — which owns encoding, `updatedAt` stamping and result decoding. Four
 * things it cannot express stay on the raw Kysely handle:
 *
 *   - `list`: the search predicate is `title LIKE ? OR slug LIKE ?`, and the flat
 *     `where` DSL has no `or`. The row query and the count share one compiled
 *     predicate, so the count stays raw with it rather than being restated in the
 *     DSL where the two could drift apart.
 *   - `populateLocales`: a `localeGroup IN (…)` sibling lookup projected to three
 *     columns, fanned out over a page of rows.
 *   - `trash.restore`: one statement that is guarded (`deletedAt IS NOT NULL`)
 *     *and* returns the row. The wrapper's `update` is primary-key-only and
 *     `updateMany` returns a count, so splitting it would change both the query
 *     count and what restoring a live entry does.
 *
 * Soft delete is a domain policy, not a wrapper feature: trashing is an ordinary
 * `deletedAt` write and every read filters `deletedAt: null` itself.
 *
 * No `virtual:astromech/config` import — this stays directly testable. Resolves
 * the db per-op like the original data layer; `transaction` rebinds a fresh
 * instance to the Kysely tx handle.
 */

import type { ExpressionBuilder, Updateable } from 'kysely';
import { getDb } from '@/database/registry.js';
import { supportsTransactions } from '@/database/capabilities.js';
import { encodePatch, decode } from '@/database/codec.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { entries } from '@/database/schema.js';
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

        // where filters. Column comparisons follow the shared `where` DSL
        // (database/storage/create-storage.ts): `undefined` or an absent key means
        // unfiltered, a deliberate `null` renders `IS NULL`. Reading a bare `null`
        // as unfiltered instead returned every row to a caller asking for the
        // null ones.
        if (params.where) {
            for (const [key, value] of Object.entries(params.where)) {
                if (value === undefined) continue;
                if (key === 'locale') continue; // handled above

                if (key === '_search') {
                    // Not a column: a LIKE against null says nothing, so only a
                    // term filters.
                    if (typeof value === 'string') {
                        conditions.push(eb('title', 'like', `%${value}%`));
                    }
                } else if (key === 'status') {
                    if (Array.isArray(value)) {
                        conditions.push(eb('status', 'in', value as EntryStatus[]));
                    } else if (value === null) {
                        conditions.push(eb('status', 'is', null));
                    } else {
                        conditions.push(eb('status', '=', value as EntryStatus));
                    }
                } else if (key === 'slug') {
                    conditions.push(
                        value === null
                            ? eb('slug', 'is', null)
                            : eb('slug', '=', value as string)
                    );
                } else if (key === 'title') {
                    conditions.push(
                        value === null
                            ? eb('title', 'is', null)
                            : eb('title', '=', value as string)
                    );
                } else if (key === 'id') {
                    const inClause =
                        value === null ? undefined : (value as { in?: unknown }).in;
                    if (Array.isArray(inClause)) {
                        conditions.push(eb('id', 'in', inClause as string[]));
                    } else if (value === null) {
                        conditions.push(eb('id', 'is', null));
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

    // Unbound when there is no override, so it follows `setDb` per call exactly
    // as `handle()` does.
    const storage = createStorage(entries, dbOverride);

    const supports: readonly Capability[] = BUILT_IN_SUPPORTS;

    async function transaction<T>(
        fn: (storage: EntryStorage<Entry>, db: Db) => Promise<T>
    ): Promise<T> {
        // `handle()`, not `getDb()`: a storage already bound to a tx handle must
        // nest on that handle, or it opens a second transaction on the base
        // connection and the inner writes escape the outer rollback.
        return handle()
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
        let candidate = baseSlug;
        let counter = 1;

        while (true) {
            const existing = await storage.findOne({
                type,
                locale,
                slug: candidate,
                deletedAt: null,
                // Staged rows legitimately share their canonical's slug; they are
                // outside the (partial) slug unique index, so ignore them here.
                stagedFor: null,
                id: excludeId === undefined ? undefined : { ne: excludeId },
            });

            if (!existing) return candidate;

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
        const row = await storage.findOne({
            id,
            deletedAt: opts?.includeTrashed === true ? undefined : null,
        });
        if (!row) return null;
        return populateLocaleSingle(handle(), row);
    }

    async function create(data: EntryWrite & { type: string }): Promise<Entry> {
        const created = await storage.create({
            type: data.type,
            title: data.title ?? '',
            slug: data.slug ?? null,
            locale: data.locale ?? defaultLocale,
            // Omitted rather than passed as undefined when absent: `encodeWith`
            // only fills a column's app default for a key that isn't there, and
            // the descriptor declares `defaultUlid` — so this is the one place a
            // localeGroup is minted, in the same id format as every other id.
            ...(data.localeGroup !== undefined && { localeGroup: data.localeGroup }),
            fields: data.fields ?? {},
            status: data.status ?? 'unpublished',
            stagedFor: data.stagedFor ?? null,
            publishedAt: data.publishedAt ?? null,
            createdBy: data.createdBy ?? null,
            updatedBy: data.updatedBy ?? null,
        });
        return populateLocaleSingle(handle(), created);
    }

    async function update(id: string, data: EntryWrite): Promise<Entry> {
        // An explicitly-`undefined` key means "leave this column alone" (`Patch`
        // admits it and the encoder drops it), so the partial write forwards
        // straight through. `updatedAt` is stamped by the wrapper (the column
        // declares `onUpdate`).
        const updated = await storage.update(id, {
            title: data.title,
            slug: data.slug,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
            locale: data.locale,
            localeGroup: data.localeGroup,
            updatedBy: data.updatedBy,
        });
        return populateLocaleSingle(handle(), updated);
    }

    async function del(id: string, opts?: { cascadeLocales?: boolean }): Promise<void> {
        if (opts?.cascadeLocales === true) {
            const existing = await storage.findOne({ id });
            const localeGroup = existing?.localeGroup;
            if (localeGroup !== undefined) {
                await storage.deleteMany({ localeGroup });
                return;
            }
        }
        await storage.delete(id);
    }

    const trash = {
        trash: async (id: string, opts?: { cascadeLocales?: boolean }): Promise<void> => {
            const row = await storage.findOne({ id });
            if (!row) throw new Error(`Entry '${id}' not found`);
            const now = new Date();

            // Idempotent: re-trashing an already-trashed entry is a no-op.
            if (row.deletedAt === null) {
                await storage.update(id, { deletedAt: now });
            }

            if (opts?.cascadeLocales === true) {
                await storage.updateMany(
                    {
                        localeGroup: row.localeGroup,
                        id: { ne: id },
                        deletedAt: null,
                    },
                    { deletedAt: now }
                );
            }
        },

        restore: async (id: string): Promise<Entry> => {
            const db = handle();
            // Guarded *and* returning: not expressible through the wrapper's
            // primary-key `update` / count-returning `updateMany`.
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
            await storage.deleteMany({ type, deletedAt: { ne: null } });
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
            const row = await storage.findOne({
                stagedFor: canonicalId,
                deletedAt: null,
            });
            if (!row) return null;
            return populateLocaleSingle(handle(), row);
        },
    };

    const translatable = {
        siblings: async (localeGroup: string, excludeId?: string): Promise<Entry[]> => {
            const siblingRows = await storage.findMany({
                where: {
                    localeGroup,
                    deletedAt: null,
                    id: excludeId === undefined ? undefined : { ne: excludeId },
                },
            });
            return populateLocales(handle(), siblingRows);
        },

        propagateFields: async (
            localeGroup: string,
            excludeId: string,
            values: JsonObject
        ): Promise<void> => {
            const siblings = await storage.findMany({
                where: {
                    localeGroup,
                    id: { ne: excludeId },
                    deletedAt: null,
                },
            });

            for (const sibling of siblings) {
                // Rows come back decoded, so `fields` is already the parsed object.
                const existingFields = (sibling.fields ?? {}) as JsonObject;
                await storage.update(sibling.id, {
                    fields: { ...existingFields, ...values },
                });
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
