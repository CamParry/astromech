/**
 * The user repository: the shared content repository over
 * `users`/`user_content`/`user_versions`, the user reads with their locale
 * fallback and name/email search, and the named account-row reads and writes.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type { ContentRow, ContentWrite, JoinedWhere } from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type { JsonObject, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { getRelationshipRepository } from '@/content/repository/relationships';
import { RESOURCE_SPECS } from '@/content/resources';
import { chunks } from '@/database/chunks';
import { encodeWith, kyselyTableKey } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import {
    accountsTable,
    userContentTable,
    usersTable,
    userVersionsTable,
} from '@/database/tables';
import { createLazyRegistry } from '@/registry';

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

/** What `findMany` and `count` filter, order and page by. */
export type UserListParams = {
    search?: string | undefined;
    sort?: SortOption | SortOption[] | undefined;
    /** The locale each row is read in where it has one; the default otherwise. */
    locale?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

/** The account-row columns a profile write may change. */
type UserAccountPatch = Pick<Patch<typeof usersTable>, 'name' | 'email' | 'role'>;

export type UserRepository = ReturnType<typeof createUserRepository>;

/** The two joined rows plus the locale list, in the shape the service reads. */
function toUserRow(
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

/**
 * Every handle and the default locale resolve per call, so the one registered
 * repository follows a transaction scope and a config reload.
 */
function createUserRepository() {
    const owners = createRepository(usersTable);
    const accounts = createRepository(accountsTable);
    const content = createContentRepository(
        {
            table: usersTable,
            contentTable: userContentTable,
            versionsTable: userVersionsTable,
            ownerColumn: 'userId',
        },
        { decode: toUserRow }
    );

    const ownerKey = kyselyTableKey(usersTable.name);
    const contentKey = kyselyTableKey(userContentTable.name);

    /**
     * The list predicate. Rows and count share it so the two cannot drift; the
     * locale is pinned to the default, which every listed user is read from.
     */
    function filter(params: UserListParams): JoinedWhere {
        const { search } = params;
        const defaultLocale = getDefaultContentLocale();
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
     * Omit `limit` for every match.
     */
    async function findMany(params: UserListParams = {}): Promise<UserRow[]> {
        return content.findMany({
            where: filter(params),
            orderBy: buildOrderBy(RESOURCE_SPECS.user.sortable, params.sort, [
                { field: 'name', direction: 'asc' },
            ]),
            limit: params.limit,
            offset: params.offset,
            locale: params.locale,
        });
    }

    async function count(params: UserListParams = {}): Promise<number> {
        return content.count(filter(params));
    }

    /** Every content row written in `locale`, for the relationship and validity scans. */
    async function findByLocale(locale: string): Promise<UserRow[]> {
        const raw = await content
            .kysely()
            .joined()
            .where((eb) => eb(`${contentKey}.locale`, '=', locale))
            .execute();
        return content.decodeRows(raw);
    }

    /** The account row alone, read as a `UserRow` with no content. */
    async function findAccountRow(id: string): Promise<UserRow | null> {
        const own = await owners.findOne({ id });
        if (!own) return null;
        return {
            id: own.id,
            contentId: '' as UserRow['contentId'],
            locale: getDefaultContentLocale(),
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
     * One user in `locale` (the default when absent). With `fallbackLocale`, a
     * miss reads that locale, then the account row alone: a `users` row written
     * outside the users service has no content row, and must still read.
     */
    async function findOne(
        id: string,
        options?: { locale?: string | undefined; fallbackLocale?: string | undefined }
    ): Promise<UserRow | null> {
        const locale = options?.locale ?? getDefaultContentLocale();
        const found = await content.findOne({ id, locale });
        const fallbackLocale = options?.fallbackLocale;
        if (found || fallbackLocale === undefined) return found;
        if (fallbackLocale !== locale) {
            const fallback = await content.findOne({ id, locale: fallbackLocale });
            if (fallback) return fallback;
        }
        return findAccountRow(id);
    }

    /** The account rows for `ids`, in slices small enough for one `IN (…)` each. */
    async function findAccounts(ids: Iterable<string>): Promise<UserTableRow[]> {
        const rows: UserTableRow[] = [];
        for (const chunk of chunks(ids)) {
            rows.push(...(await owners.findMany({ where: { id: { in: chunk } } })));
        }
        return rows;
    }

    async function create(own: NewUserTableRow, write: ContentWrite): Promise<UserRow> {
        return content.create(own, write);
    }

    /**
     * Insert the `users` row only while the table is empty, in one statement.
     * `true` when this call inserted it: first-run setup's gate, so a losing
     * racer inserts nothing.
     */
    async function createIfEmpty(row: NewUserTableRow): Promise<boolean> {
        const { db, table } = owners.kysely();
        // `encodeWith` mints the id and the timestamps the columns default, and
        // serializes every value; the Kysely handle spells the column names the
        // way `CamelCasePlugin` does.
        const cells = Object.entries(encodeWith(usersTable, row));
        const result = await db
            .insertInto(table)
            .columns(cells.map(([column]) => column))
            .expression(
                db
                    .selectNoFrom(
                        cells.map(([column, value]) => sql.val(value).as(column))
                    )
                    .where(({ not, exists, selectFrom }) =>
                        not(exists(selectFrom(table).select(sql.lit(1).as('one'))))
                    )
            )
            .executeTakeFirst();
        return Number(result.numInsertedOrUpdatedRows ?? 0) === 1;
    }

    /** Write the better-auth credential account that lets `userId` sign in with `passwordHash`. */
    async function createCredentialAccount(
        userId: string,
        passwordHash: string
    ): Promise<void> {
        const now = new Date();
        await accounts.create({
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
        });
    }

    /**
     * Drops the row and every relationship pointing at (or from) it. Call it
     * inside a transaction: an index outliving a failed delete would name a row
     * that is gone.
     */
    async function del(id: string): Promise<void> {
        // Relationship rows first: deleting the user row is what orphans them.
        await getRelationshipRepository().deleteByResource(id, 'user');
        await content.delete(id);
    }

    return {
        findOne,
        findAnyLocale: content.findAnyLocale,
        findMany,
        count,
        findByLocale,
        /** The account row alone, the one better-auth writes, or null. */
        findAccount: (id: string): Promise<UserTableRow | null> => owners.findOne({ id }),
        findAccounts,
        /** Every user's id. */
        findIds: (): Promise<string[]> => owners.pluck('id'),
        /** The ids of the users holding `role`. */
        findIdsByRole: (role: string): Promise<string[]> =>
            owners.pluck('id', { where: { role } }),
        /** How many users hold `role`. */
        countByRole: (role: string): Promise<number> => owners.count({ role }),
        create,
        createIfEmpty,
        createCredentialAccount,
        update: content.update,
        /** Write the account-row columns, whatever the locale. */
        updateAccount: async (id: string, patch: UserAccountPatch): Promise<void> => {
            await owners.update(id, patch);
        },
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        findStoredRows: content.findStoredRows,
    };
}

const userRepository = createLazyRegistry<UserRepository>(
    'userRepository',
    createUserRepository
);

/** The user repository, built on first use. */
export function getUserRepository(): UserRepository {
    return userRepository.get();
}

/**
 * Swap the user repository, so a test can replace one method.
 * @internal
 */
export function setUserRepository(repository: UserRepository): void {
    userRepository.set(repository);
}
