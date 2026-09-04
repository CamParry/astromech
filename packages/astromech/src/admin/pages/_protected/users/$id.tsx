/**
 * User edit route. Wraps the shared `UserEditPage`; the loader prefetches
 * the default-locale user.
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { UserEditPage } from '@/admin/components/users/user-edit-page';
import { userQueryOptions } from '@/admin/hooks/users';

function UserEditRoutePage(): React.ReactElement {
    const { id } = Route.useParams();
    return <UserEditPage id={id} />;
}

export const Route = createFileRoute('/_protected/users/$id')({
    loader: ({ context, params }) =>
        context.queryClient.ensureQueryData(userQueryOptions(params.id)),
    component: UserEditRoutePage,
});
