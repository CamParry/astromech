/**
 * Global version history route for the site's globals; the loader prefetches the
 * global and, once it has a row in the locale, its versions. A plugin's global id
 * redirects to the plugin route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultContentLocale } from 'astromech/shared';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalVersionsPage } from '../../../../components/globals/global-versions-page';
import {
    globalQueryOptions,
    globalVersionsQueryOptions,
} from '../../../../hooks/globals';
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
    loader: async ({ context, params, deps }) => {
        const locale = deps.locale ?? defaultContentLocale(adminConfig);
        const global = await context.queryClient.ensureQueryData(
            globalQueryOptions(params.key, locale)
        );
        // A locale never saved has no versions, and the versions read answers
        // 404 for it; the page shows its empty state instead.
        if (global === null) return;
        await context.queryClient.ensureQueryData(
            globalVersionsQueryOptions(params.key, locale)
        );
    },
    component: GlobalVersionsRoutePage,
});
