/**
 * Runs one of the resource modules' `mutationOptions`: it invalidates the keys
 * the options' `meta` names, toasts the result, then calls the caller's own
 * callbacks. The toasts need React context, so they run here, not in a cache.
 */

import type {
    QueryKey,
    UseMutationOptions,
    UseMutationResult,
} from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AstromechApiError } from 'astromech/fetch';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/toast';

/** What an admin mutation declares about itself, read by `useAdminMutation`. */
export type AdminMutationMeta = {
    /** Keys that go stale when the mutation succeeds. */
    invalidates: readonly QueryKey[];
    /** i18n key toasted on success; absent when the caller reports it. */
    successMessage?: string;
    /** i18n key toasted when the error carries no message of its own. */
    errorMessage: string;
    /** Interpolation values for both messages. */
    messageValues?: Record<string, string>;
};

declare module '@tanstack/react-query' {
    // TanStack's documented way to type `meta` across the app.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Register {
        mutationMeta: AdminMutationMeta;
    }
}

/** The caller's side of a mutation, run after the invalidation and the toast. */
export type AdminMutationCallbacks<TData, TVariables> = {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error) => void;
    /** False when the caller reports the error itself, as a `useFieldsForm` submit does. */
    toastError?: boolean;
};

export function useAdminMutation<TData, TVariables>(
    options: UseMutationOptions<TData, Error, TVariables>,
    callbacks?: AdminMutationCallbacks<TData, TVariables>
): UseMutationResult<TData, Error, TVariables> {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const meta = options.meta;

    return useMutation({
        ...options,
        onSuccess: (data, variables) => {
            for (const queryKey of meta?.invalidates ?? []) {
                void queryClient.invalidateQueries({ queryKey });
            }
            if (meta?.successMessage !== undefined) {
                toast({
                    message: t(meta.successMessage, meta.messageValues ?? {}),
                    variant: 'success',
                });
            }
            callbacks?.onSuccess?.(data, variables);
        },
        onError: (error) => {
            if (callbacks?.toastError !== false) {
                toast({
                    message: errorMessage(error, t(meta?.errorMessage ?? 'common.error')),
                    variant: 'error',
                });
            }
            callbacks?.onError?.(error);
        },
    });
}

/**
 * The error's own message, or the fallback. A batch rolls back whole, so the
 * id the server names in `details.failedId` is the row that stopped it.
 */
function errorMessage(error: Error, fallback: string): string {
    if (error instanceof AstromechApiError) {
        const failedId = error.details?.['failedId'];
        return typeof failedId === 'string'
            ? `${error.message} (${failedId})`
            : error.message;
    }
    return error.message !== '' ? error.message : fallback;
}
