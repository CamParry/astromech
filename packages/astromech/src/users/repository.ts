/**
 * The user repository: the shared content repository over
 * `users`/`user_content`/`user_versions`, the user reads with their locale
 * fallback and name/email search, and the named `users` row reads and writes.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type { ContentWrite, JoinedWhere, Resource } from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type { JsonObject, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { relationshipRepository } from '@/content/repository/relationships';
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

/** One locale of one user, as the users service reads it. */
export type UserResource = Resource & {
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    role: string;
    /** The `users` row's `updatedAt`. */
    accountUpdatedAt: Date;
};

/** What `findMany` and `count` filter, order and page by. */
export type UserListParams = {
    search?: string | undefined;
    sort?: SortOption | SortOption[] | undefined;
    /** The locale each user is read in where they have one; the default otherwise. */
    locale?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
};

/** The `users` row columns a profile write may change. */
type UserRowPatch = Pick<Patch<typeof usersTable>, 'name' | 'email' | 'role'>;

export type UserRepository = ReturnType<typeof createUserRepository>;

/** The two joined rows plus the locale list, as the resource the service reads. */
function toUserResource(
    resourceRow: UserTableRow,
    contentRow: UserContentRow,
    locales: string[]
): UserResource {
    return {
        id: contentRow.userId,
        contentId: contentRow.id as UserResource['contentId'],
        locale: contentRow.locale,
        locales,
        staged: false,
        fields: (contentRow.fields ?? {}) as JsonObject,
        email: resourceRow.email,
        name: resourceRow.name,
        emailVerified: resourceRow.emailVerified,
        image: resourceRow.image,
        role: resourceRow.role,
        createdAt: resourceRow.createdAt,
        updatedAt: contentRow.updatedAt,
        createdBy: contentRow.createdBy,
        updatedBy: contentRow.updatedBy,
        accountUpdatedAt: resourceRow.updatedAt,
    };
}

/**
 * Every handle and the default locale resolve per call, so the one registered
 * repository follows a transaction scope and a config reload.
 */
function createUserRepository() {
    const resourceRows = createRepository(usersTable);
    const accounts = createRepository(accountsTable);
    const content = createContentRepository(
        {
            table: usersTable,
            contentTable: userContentTable,
            versionsTable: userVersionsTable,
            resourceIdColumn: 'userId',
        },
        { decode: toUserResource }
    );

    const resourceKey = kyselyTableKey(usersTable.name);
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
                        eb(`${resourceKey}.name`, 'like', `%${search}%`),
                        eb(`${resourceKey}.email`, 'like', `%${search}%`),
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
    async function findMany(params: UserListParams = {}): Promise<UserResource[]> {
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
    async function findByLocale(locale: string): Promise<UserResource[]> {
        const raw = await content
            .kysely()
            .joined()
            .where((eb) => eb(`${contentKey}.locale`, '=', locale))
            .execute();
        return content.decodeRows(raw);
    }

    /**
     * One user in `locale` (the default when absent). With `fallbackLocale`, a
     * miss reads that locale, then any locale the user has; a user with no
     * content row reads as null.
     */
    async function findOne(
        id: string,
        options?: { locale?: string | undefined; fallbackLocale?: string | undefined }
    ): Promise<UserResource | null> {
        const locale = options?.locale ?? getDefaultContentLocale();
        const found = await content.findOne({ id, locale });
        const fallbackLocale = options?.fallbackLocale;
        if (found || fallbackLocale === undefined) return found;
        if (fallbackLocale !== locale) {
            const fallback = await content.findOne({ id, locale: fallbackLocale });
            if (fallback) return fallback;
        }
        return content.findAnyLocale(id);
    }

    /** The `users` rows for `ids`, in slices small enough for one `IN (…)` each. */
    async function findUserRows(ids: Iterable<string>): Promise<UserTableRow[]> {
        const rows: UserTableRow[] = [];
        for (const chunk of chunks(ids)) {
            rows.push(...(await resourceRows.findMany({ where: { id: { in: chunk } } })));
        }
        return rows;
    }

    async function create(
        resourceRow: NewUserTableRow,
        write: ContentWrite
    ): Promise<UserResource> {
        return content.create(resourceRow, write);
    }

    /**
     * Insert the `users` row only while the table is empty, in one statement.
     * `true` when this call inserted it: first-run setup's gate, so a losing
     * racer inserts nothing.
     */
    async function createIfEmpty(row: NewUserTableRow): Promise<boolean> {
        const { db, table } = resourceRows.kysely();
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
     * Drops the user and every relationship pointing at (or from) them. Call it
     * inside a transaction: an index outliving a failed delete would name a user
     * who is gone.
     */
    async function del(id: string): Promise<void> {
        // Relationship rows first: deleting the user row is what orphans them.
        await relationshipRepository.deleteByResource(id, 'user');
        await content.delete(id);
    }

    return {
        findOne,
        findAnyLocale: content.findAnyLocale,
        findMany,
        count,
        findByLocale,
        /** The `users` row alone, the one better-auth writes, or null. */
        findUserRow: (id: string): Promise<UserTableRow | null> =>
            resourceRows.findOne({ id }),
        findUserRows,
        /** Every user's id. */
        findIds: (): Promise<string[]> => resourceRows.pluck('id'),
        /** The ids of the users holding `role`. */
        findIdsByRole: (role: string): Promise<string[]> =>
            resourceRows.pluck('id', { where: { role } }),
        /** How many users hold `role`. */
        countByRole: (role: string): Promise<number> => resourceRows.count({ role }),
        create,
        createIfEmpty,
        createCredentialAccount,
        update: content.update,
        /** Write the `users` row columns, whatever the locale. */
        updateUserRow: async (id: string, patch: UserRowPatch): Promise<void> => {
            await resourceRows.update(id, patch);
        },
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        findStoredRows: content.findStoredRows,
    };
}

/** The user repository. Stateless: every handle and the default locale resolve per call. */
export const userRepository = createUserRepository();
