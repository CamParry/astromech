/**
 * Entry version history route for the site's types; the loader prefetches the
 * entry and, once it has a row in the locale, its versions. A plugin's type id
 * redirects to the plugin route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultContentLocale } from 'astromech/shared';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryVersionsPage } from '../../../../../components/entries/entry-versions-page';
import {
    entryQueryOptions,
    entryVersionsQueryOptions,
} from '../../../../../hooks/entries';
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
    loader: async ({ context, params, deps }) => {
        const locale = deps.locale ?? defaultContentLocale(adminConfig);
        const entry = await context.queryClient.ensureQueryData(
            entryQueryOptions(params.type, params.id, locale)
        );
        // A locale with no row has no versions, and the versions read answers
        // 404 for it; the page shows its empty state instead.
        if (entry === null) return;
        await context.queryClient.ensureQueryData(
            entryVersionsQueryOptions(params.type, params.id, locale)
        );
    },
    component: EntryVersionsRoutePage,
});
