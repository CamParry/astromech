/**
 * Plugin global version history route. Builds a plugin `GlobalsMount` and
 * renders the shared `GlobalVersionsPage`; globals with versioning off never
 * link here.
 */

import type { GlobalsService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { GlobalVersionsPage } from '@/admin/components/globals/global-versions-page';
import { buildPluginGlobalsMount } from '@/admin/components/globals/mount';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function PluginGlobalVersionsPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale } = Route.useSearch();
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
    return <GlobalVersionsPage mount={mount} locale={locale} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/versions')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalVersionsPage,
});
