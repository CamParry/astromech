/**
 * Global edit route — host globals. Wraps the shared `GlobalEditPage`; the
 * loader prefetches the global, and a qualified key redirects to the plugin
 * route.
 */

import type { GlobalsBinding } from '../../../../components/globals/binding';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { globalPermission } from 'astromech/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalEditPage } from '../../../../components/globals/global-edit-page';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../components/ui/page';
import { globalQueryOptions } from '../../../../hooks/globals';
import { defaultContentLocale } from '../../../../utilities/content-locale';
import { validateEntryEditSearch } from '../../../../utilities/entry-admin-path';
import { pluginGlobalRouteParams } from '../../../../utilities/global-admin-path';

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
    const binding: GlobalsBinding = {
        key,
        cacheScope: '',
        config,
        basePath: `/globals/${key}`,
        permissionFor: (action) => globalPermission(key, action),
    };
    return <GlobalEditPage binding={binding} locale={locale} staged={staged} />;
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
