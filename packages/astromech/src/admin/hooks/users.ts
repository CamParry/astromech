/**
 * Query and mutation hooks for users.
 */

import type { User, UserQueryParams } from '@/types/index';
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client/index';
import { useToast } from '../components/ui/index';
import { queryKeys } from './use-query-keys';

// ============================================================================
// Query hooks
// ============================================================================

export function useUsersQuery(params?: UserQueryParams) {
    return useQuery({
        queryKey: queryKeys.users.list(params as Record<string, unknown>),
        queryFn: () => astromechClient.users.query(params),
    });
}

export function userQueryOptions(id: string) {
    return queryOptions({
        queryKey: queryKeys.users.detail(id),
        queryFn: () => astromechClient.users.get({ id }),
    });
}

export function useUser(id: string) {
    return useQuery(userQueryOptions(id));
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useCreateUser(options?: { onSuccess?: (user: User) => void }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (data: { name: string; email: string; roleSlug: string }) =>
            astromechClient.users.create(data),
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

export function useUpdateUser(
    id: string,
    options?: {
        onSuccess?: (user: User) => void;
        onFormReset?: () => void;
    }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (data: Partial<{ name: string; roleSlug: string }>) =>
            astromechClient.users.update({ id, data }),
        onSuccess: (user) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
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
