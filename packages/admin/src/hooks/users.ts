/**
 * Queries and mutations for users. `userMutations()` is the table of writes,
 * each naming the keys it invalidates and its toasts; `useAdminMutation` runs
 * them.
 */

import type { UserCreateData, UserQueryParams, UserUpdateData } from 'astromech';
import { mutationOptions, queryOptions, useQuery } from '@tanstack/react-query';
import { astromechUntypedClient } from 'astromech/fetch';
import { queryKeys } from './use-query-keys';

export function useUsersQuery(params?: UserQueryParams, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.users.list(params as Record<string, unknown>),
        queryFn: () => astromechUntypedClient.users.query(params),
        enabled: options?.enabled ?? true,
    });
}

/**
 * One user, in `locale` when given. A locale with no content row reads back
 * the default locale's content, so every locale is its own cache entry.
 */
export function userQueryOptions(id: string, locale?: string) {
    return queryOptions({
        queryKey: queryKeys.users.detail(id, locale),
        queryFn: () =>
            astromechUntypedClient.users.get({
                id,
                ...(locale !== undefined ? { locale } : {}),
            }),
    });
}

export function useUser(id: string, locale?: string) {
    return useQuery(userQueryOptions(id, locale));
}

/** One locale's saved versions of a user, newest last. */
function userVersionsQueryOptions(id: string, locale: string) {
    return queryOptions({
        queryKey: queryKeys.users.versions(id, locale),
        queryFn: () => astromechUntypedClient.users.versions({ id, locale }),
    });
}

export function useUserVersions(id: string, locale: string, enabled = true) {
    return useQuery({ ...userVersionsQueryOptions(id, locale), enabled });
}

/**
 * Every write the admin makes to users. The first write to a locale with no
 * row creates it, so each invalidates every user key: lists, rows, versions.
 */
export function userMutations() {
    const users = astromechUntypedClient.users;
    const invalidates = [queryKeys.users.all()];
    return {
        create: mutationOptions({
            mutationKey: ['users', 'create'],
            mutationFn: (data: UserCreateData) => users.create({ data }),
            meta: {
                invalidates,
                successMessage: 'users.updated',
                errorMessage: 'users.saveFailed',
            },
        }),
        update: mutationOptions({
            mutationKey: ['users', 'update'],
            mutationFn: ({
                id,
                locale,
                data,
            }: {
                id: string;
                locale?: string | undefined;
                data: UserUpdateData;
            }) => users.update({ id, ...(locale !== undefined ? { locale } : {}), data }),
            meta: {
                invalidates,
                successMessage: 'users.updated',
                errorMessage: 'users.saveFailed',
            },
        }),
        delete: mutationOptions({
            mutationKey: ['users', 'delete'],
            mutationFn: (id: string) => users.delete({ id }),
            meta: {
                invalidates,
                successMessage: 'users.deleted',
                errorMessage: 'users.deleteFailed',
            },
        }),
        restoreVersion: mutationOptions({
            mutationKey: ['users', 'restoreVersion'],
            mutationFn: ({
                id,
                locale,
                versionId,
            }: {
                id: string;
                locale: string;
                versionId: string;
            }) => users.restoreVersion({ id, locale, versionId }),
            meta: {
                invalidates,
                successMessage: 'versions.restored',
                errorMessage: 'versions.restoreFailed',
            },
        }),
    };
}
