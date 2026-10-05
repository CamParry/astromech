/**
 * Queries and mutations for the block list and allow list. `securityMutations()`
 * is the table of writes; `useAdminMutation` runs them.
 */

import { mutationOptions, useQuery } from '@tanstack/react-query';
import { astromechUntypedClient } from 'astromech/fetch';
import { queryKeys } from './use-query-keys';

/** The blocks in force, newest first. */
export function useBlockedAddressesQuery() {
    return useQuery({
        queryKey: queryKeys.security.blocked(),
        queryFn: () => astromechUntypedClient.security.listBlocked(),
    });
}

/** The allowed addresses, newest first. */
export function useAllowedAddressesQuery() {
    return useQuery({
        queryKey: queryKeys.security.allowed(),
        queryFn: () => astromechUntypedClient.security.listAllowed(),
    });
}

/** Every write the admin makes to the block list and allow list; each refreshes both. */
export function securityMutations() {
    const security = astromechUntypedClient.security;
    const invalidates = [queryKeys.security.all()];
    return {
        block: mutationOptions({
            mutationKey: ['security', 'block'],
            mutationFn: (data: {
                address: string;
                reason: string | null;
                expiresAt: Date | null;
            }) => security.block({ data }),
            meta: {
                invalidates,
                successMessage: 'security.blocked',
                errorMessage: 'security.saveFailed',
            },
        }),
        unblock: mutationOptions({
            mutationKey: ['security', 'unblock'],
            mutationFn: (id: string) => security.unblock({ id }),
            meta: {
                invalidates,
                successMessage: 'security.unblocked',
                errorMessage: 'security.removeFailed',
            },
        }),
        allow: mutationOptions({
            mutationKey: ['security', 'allow'],
            mutationFn: (data: { address: string; reason: string | null }) =>
                security.allow({ data }),
            meta: {
                invalidates,
                successMessage: 'security.allowed',
                errorMessage: 'security.saveFailed',
            },
        }),
        removeAllowed: mutationOptions({
            mutationKey: ['security', 'removeAllowed'],
            mutationFn: (id: string) => security.removeAllowed({ id }),
            meta: {
                invalidates,
                successMessage: 'security.removed',
                errorMessage: 'security.removeFailed',
            },
        }),
    };
}
