/**
 * Global version history route — host globals. Wraps the shared
 * `GlobalVersionsPage`; the loader prefetches the global and its versions, and
 * a qualified key redirects to the plugin route.
 */

import type { GlobalsBinding } from '@/admin/components/globals/binding';
import type { GlobalsService } from '@/types/index';
import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalVersionsPage } from '@/admin/components/globals/global-versions-page';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { globalQueryOptions, globalVersionsQueryOptions } from '@/admin/hooks/globals';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { pluginGlobalRouteParams } from '@/admin/utilities/global-admin-path';
import { astromechClient } from '@/transport/http/client';

function GlobalVersionsRoutePage(): React.ReactElement {
    const { key } = Route.useParams();
    const { locale } = Route.useSearch();
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
    const binding: GlobalsBinding = {
        api: astromechClient.globals as unknown as GlobalsService,
        key,
        cacheScope: '',
        config,
        basePath: `/globals/${key}`,
        permissionFor: (action) => `global:${key}:${action}`,
    };
    return <GlobalVersionsPage binding={binding} locale={locale} />;
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
