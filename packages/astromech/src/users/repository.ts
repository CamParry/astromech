/**
 * The user repository — the shared content repository over
 * `users`/`user_content`/`user_versions`, plus the account-row repository and
 * the list query with its name/email search and sort allow-list.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type {
    ContentRef,
    ContentRow,
    ContentWrite,
    JoinedWhere,
} from '@/content/repository/types';
import type { JsonObject, ResolvedConfig, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { defaultContentLocale, getDefaultContentLocale } from '@/config/content-locale';
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
export function createUserRepository(config?: ResolvedConfig) {
    const defaultLocale = config
        ? defaultContentLocale(config)
        : getDefaultContentLocale();
    const accounts = createRepository(usersTable);
    const contents = createRepository(userContentTable);

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

    /**
     * Replace each row's content with the requested locale's, where that locale
     * has a row. One query for the whole page; a row with no match keeps the
     * default locale's content, which is the fallback a user read promises.
     */
    async function overlayLocale(rows: UserRow[], locale: string): Promise<UserRow[]> {
        if (rows.length === 0) return rows;
        const translations = await contents.findMany({
            where: { userId: { in: rows.map((row) => row.id) }, locale },
        });
        const byUserId = new Map(translations.map((row) => [row.userId, row]));

        return rows.map((row) => {
            const translation = byUserId.get(row.id);
            if (!translation) return row;
            return {
                ...row,
                contentId: translation.id as UserRow['contentId'],
                locale: translation.locale,
                fields: (translation.fields ?? {}) as JsonObject,
                updatedAt: translation.updatedAt,
                updatedBy: translation.updatedBy,
                createdBy: translation.createdBy,
            };
        });
    }

    async function list(params?: UserListParams, locale?: string): Promise<UserRow[]> {
        let q = content.query.joined().where(filter(params));
        for (const { col, dir } of buildOrderBy(params?.sort)) {
            q = q.orderBy(`${ownerKey}.${col}`, dir);
        }
        if (params?.limit !== undefined) q = q.limit(params.limit);
        if (params?.offset !== undefined) q = q.offset(params.offset);
        const rows = await content.query.rows(await q.execute());
        if (locale === undefined || locale === defaultLocale) return rows;
        return overlayLocale(rows, locale);
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

    /** The account row alone, read as a `UserRow` with no content. */
    async function accountRow(id: string): Promise<UserRow | null> {
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

    /** One locale of one user, with no fallback. `readUser` holds the fallback policy. */
    async function get(id: string, locale?: string): Promise<UserRow | null> {
        return content.get({ id, locale });
    }

    async function create(own: NewUserTableRow, write: ContentWrite): Promise<UserRow> {
        return content.create(own, write);
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
        /**
         * The account row alone, the one better-auth writes, for the reads and
         * writes that never touch content.
         */
        accounts,
        list,
        listContent,
        count,
        get,
        accountRow,
        create,
        update,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        anyLocale: content.anyLocale,
    };
}
