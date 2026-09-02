/**
 * Global edit route — host globals. Wraps the shared `GlobalEditPage`; the
 * loader prefetches the global, and a qualified key redirects to the plugin
 * route.
 */

import type { GlobalsMount } from '@/admin/components/globals/mount';
import type { GlobalsService } from '@/types/index';
import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalEditPage } from '@/admin/components/globals/global-edit-page';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { globalQueryOptions } from '@/admin/hooks/globals';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { pluginGlobalRouteParams } from '@/admin/utilities/global-admin-path';
import { astromechClient } from '@/transport/http/client';

function GlobalEditRoutePage(): React.ReactElement {
    const { key } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const { t } = useTranslation();
    const config = adminConfig.globals[key];
    if (!config) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('globals.notFound')}
                        description={`/globals/${key}`}
                    />
                </PageContent>
            </Page>
        );
    }
    const mount: GlobalsMount = {
        api: astromechClient.globals as unknown as GlobalsService,
        key,
        cacheScope: '',
        config,
        basePath: `/globals/${key}`,
        permissionFor: (action) => `global:${key}:${action}`,
    };
    return <GlobalEditPage mount={mount} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/globals/$key/')({
    validateSearch: validateEntryEditSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginGlobalRouteParams(params.key);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/globals/$key',
                params: plugin,
                search,
            });
        }
    },
    // The staged row is not readable through `get`, so only the canonical row
    // is prefetched; the page's `useGetStagedGlobal` fetches the other.
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: ({ context, params, deps }) =>
        context.queryClient.ensureQueryData(
            globalQueryOptions(params.key, deps.locale ?? defaultContentLocale())
        ),
    component: GlobalEditRoutePage,
});
