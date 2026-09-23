/**
 * Global version history route for the site's globals; the loader prefetches the
 * global and its versions, and a plugin's global id redirects to the plugin route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { GlobalVersionsPage } from '../../../../components/globals/global-versions-page';
import {
    globalQueryOptions,
    globalVersionsQueryOptions,
} from '../../../../hooks/globals';
import { defaultContentLocale } from '../../../../utilities/content-locale';
import { validateEntryEditSearch } from '../../../../utilities/entry-admin-path';
import { pluginGlobalRouteParams } from '../../../../utilities/global-admin-path';

function GlobalVersionsRoutePage(): React.ReactElement {
    const { key } = Route.useParams();
    const { locale } = Route.useSearch();
    return <GlobalVersionsPage globalKey={key} locale={locale} />;
}

export const Route = createFileRoute('/_protected/globals/$key/versions')({
    validateSearch: validateEntryEditSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginGlobalRouteParams(params.key);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/globals/$key/versions',
                params: plugin,
                search,
            });
        }
    },
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: ({ context, params, deps }) => {
        const locale = deps.locale ?? defaultContentLocale();
        return Promise.all([
            context.queryClient.ensureQueryData(globalQueryOptions(params.key, locale)),
            context.queryClient.ensureQueryData(
                globalVersionsQueryOptions(params.key, locale)
            ),
        ]);
    },
    component: GlobalVersionsRoutePage,
});
