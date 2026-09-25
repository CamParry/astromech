/** Admin resource create route. Renders `AdminResourceNewPage`. */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { AdminResourceNewPage } from '../../../../../../components/admin-resources/admin-resource-new-page';

function PluginResourceNewPage(): React.ReactElement {
    const { name, resource } = Route.useParams();
    return <AdminResourceNewPage plugin={name} name={resource} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/resources/$resource/new')({
    component: PluginResourceNewPage,
});
