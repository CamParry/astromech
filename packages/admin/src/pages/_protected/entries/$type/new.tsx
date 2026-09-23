/**
 * Entry create route for the site's types, carrying the `locale` search param
 * through; a plugin's type id redirects to the plugin route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { EntryNewPage } from '../../../../components/entries/entry-new-page';
import { pluginEntryRouteParams } from '../../../../utilities/entry-admin-path';

type SearchParams = {
    locale?: string;
};

function EntryCreatePage(): React.ReactElement {
    const { type } = Route.useParams();
    const search = Route.useSearch();
    return <EntryNewPage type={type} requestedLocale={search.locale} />;
}

export const Route = createFileRoute('/_protected/entries/$type/new')({
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/new',
                params: plugin,
                search,
            });
        }
    },
    component: EntryCreatePage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
