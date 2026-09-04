/**
 * User repository — the only place Kysely touches the `users` table. Every
 * method goes through `createRepository(usersTable)`: the name/email search is
 * a `contains` pair under `or`, so nothing here reaches for the raw handle.
 */

import type { UserRow } from './tables';
import type { TableInsert } from '@/database/define-table';
import type { OrderBy, Patch, Where } from '@/database/repository/create-repository';
import type { Db } from '@/database/types';
import type { SortOption } from '@/types/index';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { usersTable } from '@/database/tables';

export type NewUser = TableInsert<typeof usersTable>;

/**
 * An allow-list, not the table's full patch shape: `id` is the key, `createdAt`
 * is history, and `emailVerified` and `image` belong to better-auth's own flows.
 * Derived from the descriptor so the value types stay in step with it.
 */
export type UserPatch = Pick<
    Patch<typeof usersTable>,
    'email' | 'name' | 'fields' | 'role'
>;

export type UserListParams = {
    search?: string | undefined;
    sort?: SortOption | SortOption[] | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

const SORTABLE_COLS = ['name', 'email', 'createdAt', 'updatedAt', 'role'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

function isSortableCol(s: string): s is SortableCol {
    return (SORTABLE_COLS as readonly string[]).includes(s);
}

function buildOrderBy(sort?: SortOption | SortOption[]): OrderBy<typeof usersTable> {
    const fallback: OrderBy<typeof usersTable> = [['name', 'asc']];
    if (!sort) return fallback;
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]): OrderBy<typeof usersTable> => {
            if (!isSortableCol(field)) return [];
            return [[field, dir as 'asc' | 'desc']];
        })
    );
    return clauses.length > 0 ? clauses : fallback;
}

/** The name/email search — shared by `list` and `count` so they cannot drift. */
function searchWhere(search?: string): Where<typeof usersTable> {
    if (!search) return {};
    return { or: [{ name: { contains: search } }, { email: { contains: search } }] };
}

export type UserRepository = ReturnType<typeof createUserRepository>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createUserRepository(db?: Db) {
    const repository = createRepository(usersTable, db);

    async function list(params?: UserListParams): Promise<UserRow[]> {
        return repository.findMany({
            where: searchWhere(params?.search),
            orderBy: buildOrderBy(params?.sort),
            ...(params?.limit !== undefined && { limit: params.limit }),
            ...(params?.offset !== undefined && { offset: params.offset }),
        });
    }

    async function count(params?: { search?: string | undefined }): Promise<number> {
        return repository.count(searchWhere(params?.search));
    }

    async function countByRole(role: string): Promise<number> {
        return repository.count({ role });
    }

    /** Every user id — the `notify()` broadcast target. */
    async function ids(): Promise<string[]> {
        return repository.pluck('id');
    }

    /** User ids holding a role — the `notify()` per-role target. */
    async function idsByRole(role: string): Promise<string[]> {
        return repository.pluck('id', { where: { role } });
    }

    async function get(id: string): Promise<UserRow | null> {
        return repository.findOne({ id });
    }

    async function create(data: NewUser): Promise<UserRow> {
        return repository.create(data);
    }

    /** By primary key. Throws when no row matched. */
    async function update(id: string, patch: UserPatch): Promise<UserRow> {
        return repository.update(id, patch);
    }

    async function del(id: string): Promise<void> {
        // Relationship rows first: deleting the user row is what orphans them.
        await createRelationshipRepository(db ?? getDb()).deleteByResource(id, 'user');
        await repository.delete(id);
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
