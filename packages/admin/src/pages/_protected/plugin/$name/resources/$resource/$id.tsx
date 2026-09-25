/** Admin resource edit route. Renders `AdminResourceEditPage` for one row. */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { AdminResourceEditPage } from '../../../../../../components/admin-resources/admin-resource-edit-page';

function PluginResourceEditPage(): React.ReactElement {
    const { name, resource, id } = Route.useParams();
    return <AdminResourceEditPage plugin={name} name={resource} id={id} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/resources/$resource/$id')({
    component: PluginResourceEditPage,
});
