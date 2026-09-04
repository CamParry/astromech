/**
 * The user repository — the shared content repository over
 * `users`/`user_content`/`user_versions`, plus what only users have: the
 * account-row list query with its name/email search and sort allow-list, the
 * role counts the permission checks read, and a write that touches the account
 * columns alone.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type {
    ContentRef,
    ContentRow,
    ContentWrite,
    JoinedWhere,
} from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type { JsonObject, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { createContentRepository } from '@/content/repository/content-table';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { userContentTable, usersTable, userVersionsTable } from '@/database/tables';

/** One locale of one user, as the users service reads it. */
export type UserRow = ContentRow & {
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    role: string;
    /** The account row's `updatedAt`. */
    accountUpdatedAt: Date;
};

/**
 * An allow-list, not the table's full patch shape: `id` is the key, `createdAt`
 * is history, and `emailVerified` and `image` belong to better-auth's own flows.
 * Derived from the descriptor so the value types stay in step with it.
 */
export type UserAccountPatch = Pick<Patch<typeof usersTable>, 'email' | 'name' | 'role'>;

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

/** Order-by clauses for a sort option, falling back to name-ascending. */
function buildOrderBy(
    sort?: SortOption | SortOption[]
): { col: SortableCol; dir: 'asc' | 'desc' }[] {
    const fallback: { col: SortableCol; dir: 'asc' | 'desc' }[] = [
        { col: 'name', dir: 'asc' },
    ];
    if (!sort) return fallback;
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!isSortableCol(field)) return [];
            if (dir !== 'asc' && dir !== 'desc') return [];
            return [{ col: field, dir }];
        })
    );
    return clauses.length > 0 ? clauses : fallback;
}

export type UserRepository = ReturnType<typeof createUserRepository>;

/**
 * Build the user repository. It resolves its db handle per call, so a write
 * inside `transaction()` joins that transaction without being handed one.
 */
export function createUserRepository(opts?: { defaultLocale?: string }) {
    const defaultLocale = opts?.defaultLocale ?? getDefaultContentLocale();
    const accounts = createRepository(usersTable);

    /** The two joined rows plus the locale list, in the shape the service reads. */
    function decode(
        own: UserTableRow,
        content: UserContentRow,
        locales: string[]
    ): UserRow {
        return {
            id: content.userId,
            contentId: content.id as UserRow['contentId'],
            locale: content.locale,
            locales,
            staged: false,
            fields: (content.fields ?? {}) as JsonObject,
            email: own.email,
            name: own.name,
            emailVerified: own.emailVerified,
            image: own.image,
            role: own.role,
            createdAt: own.createdAt,
            updatedAt: content.updatedAt,
            createdBy: content.createdBy,
            updatedBy: content.updatedBy,
            accountUpdatedAt: own.updatedAt,
        };
    }

    const content = createContentRepository(
        {
            table: usersTable,
            contentTable: userContentTable,
            versionsTable: userVersionsTable,
            ownerColumn: 'userId',
        },
        { decode, defaultLocale }
    );

    const { ownerKey, contentKey } = content.query;

    /**
     * The list predicate. Rows and count share it so the two cannot drift; the
     * locale is pinned to the default, which the account-row list reads from.
     */
    function filter(params?: UserListParams): JoinedWhere {
        const search = params?.search;
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [
                eb(`${contentKey}.locale`, '=', defaultLocale),
            ];
            if (search) {
                conditions.push(
                    eb.or([
                        eb(`${ownerKey}.name`, 'like', `%${search}%`),
                        eb(`${ownerKey}.email`, 'like', `%${search}%`),
                    ])
                );
            }
            return eb.and(conditions);
        };
    }

    async function list(params?: UserListParams): Promise<UserRow[]> {
        let q = content.query.joined().where(filter(params));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(`${ownerKey}.${col}`, dir);
        }
        if (params?.limit !== undefined) q = q.limit(params.limit);
        if (params?.offset !== undefined) q = q.offset(params.offset);
        return content.query.rows(await q.execute());
    }

    async function count(params?: { search?: string | undefined }): Promise<number> {
        return content.query.count(filter(params));
    }

    /** Every user's content row in `locale`, for the relationship and validity scans. */
    async function listContent(locale: string): Promise<UserRow[]> {
        const raw = await content.query
            .joined()
            .where((eb) => eb(`${contentKey}.locale`, '=', locale))
            .execute();
        return content.query.rows(raw);
    }

    async function countByRole(role: string): Promise<number> {
        return accounts.count({ role });
    }

    /** Every user id — the `notify()` broadcast target. */
    async function ids(): Promise<string[]> {
        return accounts.pluck('id');
    }

    /** User ids holding a role — the `notify()` per-role target. */
    async function idsByRole(role: string): Promise<string[]> {
        return accounts.pluck('id', { where: { role } });
    }

    /** The account row alone, read as an empty-content `UserRow`. */
    async function ownOnly(id: string): Promise<UserRow | null> {
        const own = await accounts.findOne({ id });
        if (!own) return null;
        return {
            id: own.id,
            contentId: '' as UserRow['contentId'],
            locale: defaultLocale,
            locales: [],
            staged: false,
            fields: {},
            email: own.email,
            name: own.name,
            emailVerified: own.emailVerified,
            image: own.image,
            role: own.role,
            createdAt: own.createdAt,
            updatedAt: own.updatedAt,
            createdBy: null,
            updatedBy: null,
            accountUpdatedAt: own.updatedAt,
        };
    }

    /**
     * One locale of one user, falling back to the default locale and then to
     * the account row alone. The last fallback is here because better-auth
     * mints `users` rows outside Astromech's write path, so a user can exist
     * with no content row at all, and a session must not fail on a profile
     * nobody has written.
     */
    async function get(id: string, locale?: string): Promise<UserRow | null> {
        return (
            (await content.get({ id, locale })) ??
            (await content.get({ id })) ??
            (await ownOnly(id))
        );
    }

    /** One locale of one user, with no fallback — what versions address. */
    async function getExact(id: string, locale: string): Promise<UserRow | null> {
        return content.get({ id, locale });
    }

    async function create(own: NewUserTableRow, write: ContentWrite): Promise<UserRow> {
        return content.create(own, write);
    }

    /**
     * Write the account columns, leaving every content row untouched. Throws
     * when no row matched.
     */
    async function updateAccount(id: string, patch: UserAccountPatch): Promise<UserRow> {
        await accounts.update(id, patch);
        const row = await get(id);
        if (!row) throw new Error(`User '${id}' not found`);
        return row;
    }

    /** Write one locale's content row, creating it when it does not exist. */
    async function update(ref: ContentRef, data: ContentWrite): Promise<UserRow> {
        return content.update(ref, data);
    }

    async function del(id: string): Promise<void> {
        // Relationship rows first: deleting the user row is what orphans them.
        await createRelationshipRepository().deleteByResource(id, 'user');
        await content.delete(id);
    }

    return {
        list,
        listContent,
        count,
        countByRole,
        ids,
        idsByRole,
        get,
        getExact,
        create,
        updateAccount,
        update,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        anyLocale: content.anyLocale,
    };
}
