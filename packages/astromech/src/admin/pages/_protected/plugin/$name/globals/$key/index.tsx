/**
 * Plugin global edit route. Builds a plugin `GlobalsMount` and renders the
 * shared `GlobalEditPage`; no loader prefetch, the page's `useGlobal` hook
 * fetches instead.
 */

import type { GlobalsService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalEditPage } from '@/admin/components/globals/global-edit-page';
import { buildPluginGlobalsMount } from '@/admin/components/globals/mount';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function PluginGlobalEditPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const { t } = useTranslation();
    const api = astromechClient.globals as unknown as GlobalsService;
    const mount = buildPluginGlobalsMount(adminConfig.plugins, name, key, api);
    if (!mount) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('plugins.pageNotFound')}
                        description={`/plugin/${name}/globals/${key}`}
                    />
                </PageContent>
            </Page>
        );
    }
    return <GlobalEditPage mount={mount} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalEditPage,
});
