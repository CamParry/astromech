/** Admin resource list route: a plugin's resource, addressed by the plugin namespace and resource name. */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { AdminResourceListPage } from '../../../../../../components/admin-resources/admin-resource-list-page';
import { validateListSearch } from '../../../../../../components/ui/use-list-state';

function PluginResourceListPage(): React.ReactElement {
    const { name, resource } = Route.useParams();
    return <AdminResourceListPage plugin={name} name={resource} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/resources/$resource/')({
    validateSearch: validateListSearch,
    component: PluginResourceListPage,
});
