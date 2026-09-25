/**
 * Queries and mutations for a plugin's admin resources. `adminResourceMutations()`
 * is the table of writes, each naming the keys it invalidates and its toasts;
 * `useAdminMutation` runs them.
 */

import type { UseAdminResourceResult } from './use-admin-resource';
import type { AdminResourceListInput } from 'astromech';
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { queryKeys } from './use-query-keys';

type AdminResourceTarget = Pick<UseAdminResourceResult, 'plugin' | 'name' | 'client'>;

/** One page of the resource's rows. */
export function adminResourceListQueryOptions(
    target: AdminResourceTarget,
    input: AdminResourceListInput
) {
    return queryOptions({
        queryKey: queryKeys.adminResources.list(target.plugin, target.name, input),
        queryFn: () => target.client.list(input),
    });
}

/** One row, or `null` when the get method finds none. */
export function adminResourceQueryOptions(target: AdminResourceTarget, id: string) {
    return queryOptions({
        queryKey: queryKeys.adminResources.get(target.plugin, target.name, id),
        queryFn: () => target.client.get({ id }),
    });
}

/** Every write the admin makes to a resource. Each invalidates the resource's lists and rows. */
export function adminResourceMutations(target: AdminResourceTarget) {
    const { client } = target;
    const invalidates = [queryKeys.adminResources.all(target.plugin, target.name)];
    const key = (write: string) => ['admin-resources', target.plugin, target.name, write];
    return {
        create: mutationOptions({
            mutationKey: key('create'),
            mutationFn: (data: Record<string, unknown>) => client.create({ data }),
            meta: {
                invalidates,
                successMessage: 'adminResources.created',
                errorMessage: 'adminResources.saveFailed',
            },
        }),
        update: mutationOptions({
            mutationKey: key('update'),
            mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
                client.update({ id, data }),
            meta: {
                invalidates,
                successMessage: 'adminResources.saved',
                errorMessage: 'adminResources.saveFailed',
            },
        }),
        delete: mutationOptions({
            mutationKey: key('delete'),
            mutationFn: (id: string) => client.delete({ id }),
            meta: {
                invalidates,
                successMessage: 'adminResources.deleted',
                errorMessage: 'adminResources.deleteFailed',
            },
        }),
        /** One delete call per id, in order; the first failure stops the rest. */
        deleteMany: mutationOptions({
            mutationKey: key('deleteMany'),
            mutationFn: async (ids: string[]) => {
                for (const id of ids) await client.delete({ id });
            },
            meta: {
                invalidates,
                successMessage: 'adminResources.deleted',
                errorMessage: 'adminResources.deleteFailed',
            },
        }),
    };
}
