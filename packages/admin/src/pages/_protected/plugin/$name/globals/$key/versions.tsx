/**
 * Plugin global version history route. Builds a plugin `GlobalsBinding` and
 * renders the shared `GlobalVersionsPage`; globals with versioning off never
 * link here.
 */

import type { GlobalsService } from 'astromech';
import { createFileRoute } from '@tanstack/react-router';
import { astromechClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginGlobalsBinding } from '../../../../../../components/globals/binding';
import { GlobalVersionsPage } from '../../../../../../components/globals/global-versions-page';
import { EmptyState } from '../../../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../../../components/ui/page';
import { validateEntryEditSearch } from '../../../../../../utilities/entry-admin-path';

function PluginGlobalVersionsPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale } = Route.useSearch();
    const { t } = useTranslation();
    const api = astromechClient.globals as unknown as GlobalsService;
    const binding = buildPluginGlobalsBinding(adminConfig, name, key, api);
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
    return <GlobalVersionsPage binding={binding} locale={locale} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/versions')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalVersionsPage,
});
