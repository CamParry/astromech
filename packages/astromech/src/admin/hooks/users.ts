/**
 * Query and mutation hooks for users.
 */

import type {
    User,
    UserCreateData,
    UserQueryParams,
    UserUpdateData,
} from '@/types/index';
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client';
import { useToast } from '../components/ui/toast';
import { queryKeys } from './use-query-keys';

export function useUsersQuery(params?: UserQueryParams) {
    return useQuery({
        queryKey: queryKeys.users.list(params as Record<string, unknown>),
        queryFn: () => astromechClient.users.query(params),
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
            astromechClient.users.get({
                id,
                ...(locale !== undefined ? { locale } : {}),
            }),
    });
}

export function useUser(id: string, locale?: string) {
    return useQuery(userQueryOptions(id, locale));
}

/** One locale's saved versions of a user, newest last. */
export function userVersionsQueryOptions(id: string, locale: string) {
    return queryOptions({
        queryKey: queryKeys.users.versions(id, locale),
        queryFn: () => astromechClient.users.versions({ id, locale }),
    });
}

export function useUserVersions(id: string, locale: string, enabled = true) {
    return useQuery({ ...userVersionsQueryOptions(id, locale), enabled });
}

/** Restore one of a locale's versions over its current content row. */
export function useRestoreUserVersion(
    id: string,
    locale: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (versionId: string) =>
            astromechClient.users.restoreVersion({ id, locale, versionId }),
        onSuccess: () => {
            // The versions key sits under the detail prefix, so one
            // invalidation covers the user's locales and their versions.
            void queryClient.invalidateQueries({
                queryKey: queryKeys.users.detailPrefix(id),
            });
            toast({ message: t('versions.restored'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('versions.restoreFailed'),
                variant: 'error',
            });
        },
    });
}

export function useCreateUser(options?: { onSuccess?: (user: User) => void }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (data: UserCreateData) => astromechClient.users.create({ data }),
        onSuccess: (user) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
            toast({ message: t('users.updated'), variant: 'success' });
            options?.onSuccess?.(user);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('users.saveFailed'),
                variant: 'error',
            });
        },
    });
}

/**
 * Edit one locale's content. The first write to a locale with no row creates
 * it, so every locale of the user goes stale, not just the one written.
 */
export function useUpdateUser(
    id: string,
    options?: {
        locale?: string;
        onSuccess?: (user: User) => void;
        onFormReset?: () => void;
    }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const locale = options?.locale;

    return useMutation({
        mutationFn: (data: UserUpdateData) =>
            astromechClient.users.update({
                id,
                ...(locale !== undefined ? { locale } : {}),
                data,
            }),
        onSuccess: (user) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.users.detailPrefix(id),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
            if (locale !== undefined) {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.users.versions(id, locale),
                });
            }
            toast({ message: t('users.updated'), variant: 'success' });
            options?.onFormReset?.();
            options?.onSuccess?.(user);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('users.saveFailed'),
                variant: 'error',
            });
        },
    });
}

export function useDeleteUser(options?: { id?: string; onSuccess?: () => void }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id?: string) =>
            astromechClient.users.delete({ id: (options?.id ?? id) as string }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
            toast({ message: t('users.deleted'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('users.deleteFailed'),
                variant: 'error',
            });
        },
    });
}
