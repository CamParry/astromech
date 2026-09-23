/**
 * Plugin global edit route. Builds a plugin `GlobalsBinding` and renders the
 * shared `GlobalEditPage`; no loader prefetch, the page's `useGlobal` hook
 * fetches instead.
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginGlobalsBinding } from '../../../../../../components/globals/binding';
import { GlobalEditPage } from '../../../../../../components/globals/global-edit-page';
import { EmptyState } from '../../../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../../../components/ui/page';
import { validateEntryEditSearch } from '../../../../../../utilities/entry-admin-path';

function PluginGlobalEditPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const { t } = useTranslation();
    const binding = buildPluginGlobalsBinding(adminConfig, name, key);
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
