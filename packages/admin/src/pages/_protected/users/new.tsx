/** User create route. Renders `UserNewPage`. */

import { createFileRoute } from '@tanstack/react-router';
import { UserNewPage } from '../../../components/users/user-new-page';

export const Route = createFileRoute('/_protected/users/new')({
    component: UserNewPage,
});
