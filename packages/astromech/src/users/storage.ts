/**
 * User storage — the only place Kysely touches the `users` table.
 *
 * **Why this one is hand-rolled rather than composed on `createStorage`:**
 * `users` is one of the four better-auth tables. better-auth's adapter owns the
 * table and its column format (seconds-INTEGER timestamps, uuid ids, INTEGER
 * booleans, json TEXT), so it is deliberately not defined with `defineTable` —
 * and `createStorage` takes a `Table`, so there is nothing for it to wrap. The
 * method vocabulary matches the `Table`-backed factories and every value still
 * crosses the boundary through the string-keyed `users` codec (`LEGACY_CODECS` in
 * `database/codec.ts`). Do not "fix" this by giving `users` a `Table`: that
 * would enrol a better-auth-owned table in our DDL/migration pipeline.
 *
 * The goal being served is "no raw Kysely above `storage/`", not "everything goes
 * through `createStorage`".
 */

import type { ExpressionBuilder, Insertable, Updateable } from 'kysely';
import { getDb } from '@/database/registry';
import { decode, encode, encodePatch } from '@/database/codec';
import { createRelationshipStorage } from '@/database/storage/relationships';
import type { DB, Db } from '@/database/types';
import type { JsonObject, SortOption } from '@/types/index';
import type { UserRow } from './schema';

// ============================================================================
// Write shapes
//
// Optional keys spell `| undefined` explicitly (rather than relying on `?`) so a
// caller can forward a possibly-undefined value without an `...(x && { x })`
// spread — the same widening `createStorage`'s `Patch` does, and safe for the
// same reason: the codec strips undefined keys before the write.
// ============================================================================

export type NewUser = {
    id?: string | undefined;
    email: string;
    name: string;
    emailVerified?: boolean | undefined;
    image?: string | null | undefined;
    fields?: JsonObject | undefined;
    roleSlug?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
};

export type UserPatch = {
    email?: string | undefined;
    name?: string | undefined;
    fields?: JsonObject | undefined;
    roleSlug?: string | undefined;
};

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

/** The name/email search OR — shared by `list` and `count` so they cannot drift. */
function buildUsersWhere(eb: ExpressionBuilder<DB, 'users'>, search?: string) {
    if (!search) return undefined;
    return eb.or([eb('name', 'like', `%${search}%`), eb('email', 'like', `%${search}%`)]);
}

function toRow(raw: Record<string, unknown>): UserRow {
    return decode('users', raw) as unknown as UserRow;
}

// ============================================================================
// Factory
// ============================================================================

export type UserStorage = ReturnType<typeof createUserStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createUserStorage(db?: Db) {
    /** Resolved per call so an unbound storage follows `setDb` across a reload. */
    function handle(): Db {
        return db ?? getDb();
    }

    async function list(params?: UserListParams): Promise<UserRow[]> {
        let q = handle()
            .selectFrom('users')
            .selectAll()
            .where((eb) => buildUsersWhere(eb, params?.search) ?? eb.lit(true));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(col, dir);
        }
        if (params?.limit !== undefined) q = q.limit(params.limit);
        if (params?.offset !== undefined) q = q.offset(params.offset);
        const rows = await q.execute();
        return rows.map(toRow);
    }

    async function count(params?: { search?: string | undefined }): Promise<number> {
        const row = await handle()
            .selectFrom('users')
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where((eb) => buildUsersWhere(eb, params?.search) ?? eb.lit(true))
            .executeTakeFirst();
        return Number(row?.c ?? 0);
    }

    async function countByRole(roleSlug: string): Promise<number> {
        const row = await handle()
            .selectFrom('users')
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where('roleSlug', '=', roleSlug)
            .executeTakeFirst();
        return Number(row?.c ?? 0);
    }

    /** Every user id — the `notify()` broadcast target. */
    async function ids(): Promise<string[]> {
        const rows = await handle().selectFrom('users').select('id').execute();
        return rows.map((r) => r.id);
    }

    /** User ids holding a role — the `notify()` per-role target. */
    async function idsByRole(roleSlug: string): Promise<string[]> {
        const rows = await handle()
            .selectFrom('users')
            .select('id')
            .where('roleSlug', '=', roleSlug)
            .execute();
        return rows.map((r) => r.id);
    }

    async function get(id: string): Promise<UserRow | null> {
        const row = await handle()
            .selectFrom('users')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        return row ? toRow(row) : null;
    }

    async function create(data: NewUser): Promise<UserRow> {
        // `encode` fills the app-side defaults better-auth expects for an omitted
        // id / createdAt / updatedAt, then flips to the legacy column format.
        const row = await handle()
            .insertInto('users')
            .values(encode('users', { ...data }) as unknown as Insertable<DB['users']>)
            .returningAll()
            .executeTakeFirst();
        if (!row) throw new Error('[astromech] users storage: insert returned no row');
        return toRow(row);
    }

    /** By primary key. Throws when no row matched. */
    async function update(id: string, patch: UserPatch): Promise<UserRow> {
        // No `Table` means no `onUpdate` column to drive the stamp, so it is
        // this factory's job — the same thing `createStorage` does for the tables
        // that do have one.
        const row = await handle()
            .updateTable('users')
            .set(
                encodePatch('users', {
                    ...patch,
                    updatedAt: new Date(),
                }) as unknown as Updateable<DB['users']>
            )
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();
        if (!row) {
            throw new Error(`[astromech] users storage: no row found for id "${id}"`);
        }
        return toRow(row);
    }

    async function del(id: string): Promise<void> {
        const active = handle();
        // Relationship rows first: deleting the user row is what orphans them.
        await createRelationshipStorage(active).deleteByResource(id, 'user');
        await active.deleteFrom('users').where('id', '=', id).execute();
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
