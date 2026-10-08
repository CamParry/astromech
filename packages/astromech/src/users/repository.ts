/**
 * The user repository: the shared content repository over
 * `users`/`user_content`/`user_versions`, the user reads with their locale
 * fallback and name/email search, and the named `users` row reads and writes.
 */

import type { NewUserTableRow, UserContentRow, UserTableRow } from './tables';
import type { ContentWrite, JoinedWhere, Resource } from '@/content/repository/types';
import type { Patch } from '@/database/repository/create-repository';
import type { BuiltInRoleSlug } from '@/permissions/roles';
import type { JsonObject, SortOption } from '@/types/index';
import type { Expression, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { buildOrderBy } from '@/content/list';
import { createContentRepository } from '@/content/repository/content-table';
import { relationshipRepository } from '@/content/repository/relationships';
import { sortableColumns } from '@/content/resources';
import {
    decodeWith,
    encodeUpdateWith,
    encodeWith,
    kyselyTableKey,
} from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import {
    accountsTable,
    userContentTable,
    usersTable,
    userVersionsTable,
} from '@/database/tables';
import { transaction } from '@/database/transaction';

/** One locale of one user, as the users service reads it. */
export type UserResource = Resource & {
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    role: string;
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

/** The role a write may not take from the last user holding it. */
const ADMIN_ROLE: BuiltInRoleSlug = 'admin';

/** The `users` row columns a profile write may change. */
type UserRowPatch = Pick<Patch<typeof usersTable>, 'name' | 'email' | 'role'>;

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
        updatedAt: resourceRow.updatedAt,
        contentCreatedAt: contentRow.createdAt,
        contentUpdatedAt: contentRow.updatedAt,
        createdBy: contentRow.createdBy,
        // `users` has no `updatedBy` column, so this is the content row's.
        updatedBy: contentRow.updatedBy,
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

    /**
     * The list predicate. Rows and count share it so the two cannot drift; the
     * locale is pinned to the default, which every listed user is read from.
     */
    function filter(params: UserListParams): JoinedWhere {
        const { search } = params;
        return content.whereDefaultLocale((eb) =>
            search
                ? [
                      eb.or([
                          eb(`${resourceKey}.name`, 'like', `%${search}%`),
                          eb(`${resourceKey}.email`, 'like', `%${search}%`),
                      ]),
                  ]
                : []
        );
    }

    /**
     * Name order unless `params.sort` says otherwise; an unknown sort throws.
     * Omit `limit` for every match.
     */
    async function findMany(params: UserListParams = {}): Promise<UserResource[]> {
        return content.findMany({
            where: filter(params),
            orderBy: buildOrderBy(sortableColumns('user'), params.sort, [
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

    /**
     * One user in `locale` (the default when absent). With `fallbackLocale`, a
     * miss reads that locale, then any locale the user has (media stops at the
     * fallback, so each keeps its own); a user with no content row reads null.
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

    async function create(
        resourceRow: NewUserTableRow,
        write: ContentWrite
    ): Promise<UserResource> {
        return content.create(resourceRow, write);
    }

    /**
     * `create`, only while the `users` table is empty: first-run setup's gate.
     * The `users` row goes in with one conditional statement, so a losing racer
     * writes nothing and gets `null`.
     */
    async function createIfEmpty(
        resourceRow: NewUserTableRow,
        write: ContentWrite
    ): Promise<UserResource | null> {
        // `encodeWith` fills the id and timestamps the columns default and
        // serializes every value; the Kysely handle spells the column names the
        // way `CamelCasePlugin` does.
        const cells = Object.entries(encodeWith(usersTable, resourceRow));
        return transaction(async () => {
            const { db, table } = resourceRows.kysely();
            const inserted = await db
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
                .returningAll()
                .executeTakeFirst();
            if (inserted === undefined) return null;
            return content.createContentRow(decodeWith(usersTable, inserted), write);
        });
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
     * The condition a write that takes the `admin` role from `id` adds: the user
     * is not an admin, or another user is. Kept in the write's own `WHERE`, so two
     * calls that each counted two admins cannot remove both.
     */
    function keepsAnAdmin(id: string): Expression<SqlBool> {
        return sql<SqlBool>`(${sql.ref('role')} <> ${ADMIN_ROLE} OR exists (
            select 1 from ${sql.table(resourceKey)} as other
            where other.role = ${ADMIN_ROLE} and other.id <> ${id}
        ))`;
    }

    /** Why a guarded write to `id` changed no row: the user is gone, or is the last admin. */
    async function explainRefusal(id: string): Promise<'missing' | 'last-admin'> {
        return (await resourceRows.findOne({ id })) ? 'last-admin' : 'missing';
    }

    /**
     * Write the `users` row columns, whatever the locale. Kept per resource: the
     * patch type names this table's columns. A `role` other than `admin` writes
     * only while another user holds `admin`.
     */
    async function updateUserRow(
        id: string,
        patch: UserRowPatch
    ): Promise<'updated' | 'missing' | 'last-admin'> {
        const { db, table } = resourceRows.kysely();
        const demotes = patch.role !== undefined && patch.role !== ADMIN_ROLE;
        const changed = await db
            .updateTable(table)
            .set(encodeUpdateWith(usersTable, patch))
            .where('id', '=', id)
            .$if(demotes, (query) => query.where(keepsAnAdmin(id)))
            .returning('id')
            .execute();
        return changed.length > 0 ? 'updated' : explainRefusal(id);
    }

    /**
     * Drops the user, unless they are the last admin, then every relationship
     * pointing at (or from) them. Call it inside a transaction. On D1, which opens
     * none, a failed second statement leaves index rows naming a gone user; the
     * other order would wipe a last admin's rows on an ordinary refusal.
     */
    async function del(id: string): Promise<'deleted' | 'missing' | 'last-admin'> {
        const { db, table } = resourceRows.kysely();
        const deleted = await db
            .deleteFrom(table)
            .where('id', '=', id)
            .where(keepsAnAdmin(id))
            .returning('id')
            .execute();
        if (deleted.length === 0) return explainRefusal(id);
        // Here rather than in `content.delete`, which this guarded delete and the
        // bulk entry deletes do not go through: each repository delete drops its own.
        await relationshipRepository.deleteByResource(id, 'user');
        return 'deleted';
    }

    // Hand-picked, never spread (`DECISIONS.md`, "Resource repositories do not
    // extend a base"), so a content-repository change reaches no resource unasked.
    return {
        findOne,
        findAnyLocale: content.findAnyLocale,
        findMany,
        count,
        findByLocale: content.findByLocale,
        /** The `users` row alone, the one better-auth writes, or null. */
        findUserRow: (id: string): Promise<UserTableRow | null> =>
            resourceRows.findOne({ id }),
        /** The `users` rows for `ids`. */
        findUserRows: content.findResourceRows,
        /** How many `users` rows exist, whether or not they have a content row. */
        countUserRows: (): Promise<number> => resourceRows.count(),
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
        explainConflict: content.explainConflict,
        updateUserRow,
        delete: del,
        versions: content.versions,
        translatable: content.translatable,
        locales: content.locales,
        findStoredRows: content.findStoredRows,
    };
}

/** The user repository. Stateless: every handle and the default locale resolve per call. */
export const userRepository = createUserRepository();
