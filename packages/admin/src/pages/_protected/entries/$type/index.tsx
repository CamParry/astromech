/**
 * Entry type list route for the site's types; a plugin's type id redirects to
 * the plugin route.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { EntriesListPage } from '../../../../components/entries/entries-list-page';
import {
    pluginEntryRouteParams,
    validateEntriesListSearch,
} from '../../../../utilities/entry-admin-path';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    return <EntriesListPage type={type} />;
}

export const Route = createFileRoute('/_protected/entries/$type/')({
    validateSearch: validateEntriesListSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type',
                params: plugin,
                search,
            });
        }
    },
    component: EntryIndexPage,
});
