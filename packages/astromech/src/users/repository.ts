/**
 * The user repository — the shared content repository over
 * `users`/`user_content`/`user_versions`, plus the account-row repository and
 * the list query with its name/email search.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type { ListPage } from '@/content/list';
import type { ContentRow, ContentWrite, JoinedWhere } from '@/content/repository/types';
import type { Db } from '@/database/types';
import type { JsonObject, ResolvedConfig, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { defaultContentLocale, getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { RESOURCE_SPECS } from '@/content/resources';
import { encodeWith } from '@/database/codec';
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

/** What the users list filters and orders by. */
export type UserListParams = {
    search?: string | undefined;
    sort?: SortOption | SortOption[] | undefined;
};

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
     * Name order unless `params.sort` says otherwise; an unknown sort throws.
     * Omit `page` for every match. Each row is read in `locale` where it has one.
     */
    async function list(
        params?: UserListParams,
        page?: ListPage,
        locale?: string
    ): Promise<UserRow[]> {
        return content.query.list({
            where: filter(params),
            orderBy: buildOrderBy(RESOURCE_SPECS.user.sortable, params?.sort, [
                { field: 'name', direction: 'asc' },
            ]),
            page,
            locale,
        });
    }

    async function count(params?: UserListParams): Promise<number> {
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

    /** One locale of one user, with no fallback. `findUser` holds the fallback policy. */
    async function get(id: string, locale?: string): Promise<UserRow | null> {
        return content.get({ id, locale });
    }

    async function create(own: NewUserTableRow, write: ContentWrite): Promise<UserRow> {
        return content.create(own, write);
    }

    /**
     * Drops the row and every relationship pointing at (or from) it. Call it
     * inside a transaction: an index outliving a failed delete would name a row
     * that is gone.
     */
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
        update: content.update,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        anyLocale: content.anyLocale,
    };
}

/**
 * Insert the `users` row only while the table is empty, in one statement.
 * `true` when this call inserted it. Defaults to the registered db. First-run
 * setup's gate: the losing racer inserts nothing.
 */
export async function insertFirstUser(row: NewUserTableRow, db?: Db): Promise<boolean> {
    const { db: kysely, table } = createRepository(usersTable, db).kysely();
    // `encodeWith` mints the id and the timestamps the columns default, and
    // serializes every value; the Kysely handle spells the column names the way
    // `CamelCasePlugin` does.
    const cells = Object.entries(encodeWith(usersTable, row));
    const result = await kysely
        .insertInto(table)
        .columns(cells.map(([column]) => column))
        .expression(
            kysely
                .selectNoFrom(cells.map(([column, value]) => sql.val(value).as(column)))
                .where(({ not, exists, selectFrom }) =>
                    not(exists(selectFrom(table).select(sql.lit(1).as('one'))))
                )
        )
        .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) === 1;
}
