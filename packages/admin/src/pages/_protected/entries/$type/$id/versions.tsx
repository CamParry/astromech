/**
 * Entry version history route for the site's types; the loader prefetches the
 * entry and its versions, and a plugin's type id redirects to the plugin route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { EntryVersionsPage } from '../../../../../components/entries/entry-versions-page';
import {
    entryQueryOptions,
    entryVersionsQueryOptions,
} from '../../../../../hooks/entries';
import { defaultContentLocale } from '../../../../../utilities/content-locale';
import {
    pluginEntryRouteParams,
    validateEntryEditSearch,
} from '../../../../../utilities/entry-admin-path';

function EntryVersionsRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const { locale } = Route.useSearch();
    return <EntryVersionsPage type={type} id={id} locale={locale} />;
}

export const Route = createFileRoute('/_protected/entries/$type/$id/versions')({
    validateSearch: validateEntryEditSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/$id/versions',
                params: { ...plugin, id: params.id },
                search,
            });
        }
    },
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: ({ context, params, deps }) => {
        const locale = deps.locale ?? defaultContentLocale();
        return Promise.all([
            context.queryClient.ensureQueryData(
                entryQueryOptions(params.type, params.id, locale)
            ),
            context.queryClient.ensureQueryData(
                entryVersionsQueryOptions(params.type, params.id, locale)
            ),
        ]);
    },
    component: EntryVersionsRoutePage,
});
