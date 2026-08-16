/**
 * User storage — the only place Kysely touches the `users` table.
 *
 * Row CRUD goes through `createStorage(usersTable)`, which owns encoding,
 * `updatedAt` stamping and row decoding. `list`/`count` stay on the raw handle
 * because the name/email search is an OR, which the flat `where` DSL cannot
 * express; they compile their DSL-expressible part with the wrapper's own
 * `where`, handed out by `query()`, so the two share one predicate.
 */

import type { ExpressionBuilder, Expression, SqlBool } from 'kysely';
import { getDb } from '@/database/registry';
import { decodeWith } from '@/database/codec';
import { createStorage, type Patch } from '@/database/storage/create-storage';
import { createRelationshipStorage } from '@/database/storage/relationships';
import { usersTable } from '@/database/schema';
import type { Db } from '@/database/types';
import type { TableInsert } from '@/database/define-table';
import type { SortOption } from '@/types/index';
import type { UserRow } from './schema';

type UsersEb = ExpressionBuilder<Record<string, Record<string, unknown>>, string>;

export type NewUser = TableInsert<typeof usersTable>;

/**
 * An allow-list, not the table's full patch shape: `id` is the key, `createdAt`
 * is history, and `emailVerified` and `image` belong to better-auth's own flows.
 * Derived from the descriptor so the value types stay in step with it.
 */
export type UserPatch = Pick<
    Patch<typeof usersTable>,
    'email' | 'name' | 'fields' | 'roleSlug'
>;

export type UserListParams = {
    search?: string | undefined;
    sort?: SortOption | SortOption[] | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

// ============================================================================
// Query helpers
// ============================================================================

const SORTABLE_COLS = ['name', 'email', 'createdAt', 'updatedAt', 'roleSlug'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

function isSortableCol(s: string): s is SortableCol {
    return (SORTABLE_COLS as readonly string[]).includes(s);
}

function buildOrderBy(
    sort?: SortOption | SortOption[]
): { col: SortableCol; dir: 'asc' | 'desc' }[] {
    if (!sort) return [{ col: 'name', dir: 'asc' }];
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!isSortableCol(field)) return [];
            return [{ col: field, dir: dir as 'asc' | 'desc' }];
        })
    );
    return clauses.length > 0 ? clauses : [{ col: 'name', dir: 'asc' }];
}

// ============================================================================
// Factory
// ============================================================================

export type UserStorage = ReturnType<typeof createUserStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createUserStorage(db?: Db) {
    const storage = createStorage(usersTable, db);

    /** The name/email search OR — shared by `list` and `count` so they cannot drift. */
    function filter(search?: string): (eb: UsersEb) => Expression<SqlBool> {
        const { where } = storage.query();
        const dsl = where();
        return (eb) => {
            if (!search) return dsl(eb);
            return eb.and([
                dsl(eb),
                eb.or([
                    eb('name', 'like', `%${search}%`),
                    eb('email', 'like', `%${search}%`),
                ]),
            ]);
        };
    }

    async function list(params?: UserListParams): Promise<UserRow[]> {
        const { db: handle, table } = storage.query();
        let q = handle.selectFrom(table).selectAll().where(filter(params?.search));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(col, dir);
        }
        if (params?.limit !== undefined) q = q.limit(params.limit);
        if (params?.offset !== undefined) q = q.offset(params.offset);
        const rows = await q.execute();
        return rows.map((row) => decodeWith(usersTable, row));
    }

    async function count(params?: { search?: string | undefined }): Promise<number> {
        const { db: handle, table } = storage.query();
        const row = await handle
            .selectFrom(table)
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .where(filter(params?.search))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    async function countByRole(roleSlug: string): Promise<number> {
        return storage.count({ roleSlug });
    }

    /** Every user id — the `notify()` broadcast target. */
    async function ids(): Promise<string[]> {
        const { db: handle, table } = storage.query();
        const rows = await handle.selectFrom(table).select('id').execute();
        return rows.map((row) => String(row.id));
    }

    /** User ids holding a role — the `notify()` per-role target. */
    async function idsByRole(roleSlug: string): Promise<string[]> {
        const { db: handle, table, where } = storage.query();
        const rows = await handle
            .selectFrom(table)
            .select('id')
            .where(where({ roleSlug }))
            .execute();
        return rows.map((row) => String(row.id));
    }

    async function get(id: string): Promise<UserRow | null> {
        return storage.findOne({ id });
    }

    async function create(data: NewUser): Promise<UserRow> {
        return storage.create(data);
    }

    /** By primary key. Throws when no row matched. */
    async function update(id: string, patch: UserPatch): Promise<UserRow> {
        return storage.update(id, patch);
    }

    async function del(id: string): Promise<void> {
        // Relationship rows first: deleting the user row is what orphans them.
        await createRelationshipStorage(db ?? getDb()).deleteByResource(id, 'user');
        await storage.delete(id);
    }

    return {
        list,
        count,
        countByRole,
        ids,
        idsByRole,
        get,
        create,
        update,
        delete: del,
    };
}
