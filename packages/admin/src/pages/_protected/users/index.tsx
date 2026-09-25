/**
 * Users list route: search, sort and page in the URL, rendered by
 * `UsersListPage`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { validateListSearch } from '../../../components/ui/use-list-state';
import { UsersListPage } from '../../../components/users/users-list-page';

export const Route = createFileRoute('/_protected/users/')({
    validateSearch: validateListSearch,
    component: UsersListPage,
});
