/**
 * Plugin global edit route. Builds a plugin `GlobalsBinding` and renders the
 * shared `GlobalEditPage`; no loader prefetch, the page's `useGlobal` hook
 * fetches instead.
 */

import type { GlobalsService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginGlobalsBinding } from '@/admin/components/globals/binding';
import { GlobalEditPage } from '@/admin/components/globals/global-edit-page';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function PluginGlobalEditPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const { t } = useTranslation();
    const api = astromechClient.globals as unknown as GlobalsService;
    const binding = buildPluginGlobalsBinding(adminConfig.plugins, name, key, api);
    if (!binding) {
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
    return <GlobalEditPage binding={binding} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalEditPage,
});
