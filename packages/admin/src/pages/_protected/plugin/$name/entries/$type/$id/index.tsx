/**
 * Plugin entry-type edit route. Builds a plugin `EntriesBinding` and renders
 * the shared `EntryEditPage`; no loader prefetch, the page's `useEntry`
 * hook fetches instead.
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginEntriesBinding } from '../../../../../../../components/entries/binding';
import { EntryEditPage } from '../../../../../../../components/entries/entry-edit-page';
import { EmptyState } from '../../../../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../../../../components/ui/page';
import { validateEntryEditSearch } from '../../../../../../../utilities/entry-admin-path';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const { t } = useTranslation();
    const binding = buildPluginEntriesBinding(adminConfig, name, type);
    if (!binding) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('plugins.pageNotFound')}
                        description={`/plugin/${name}/entries/${type}`}
                    />
                </PageContent>
            </Page>
        );
    }
    return <EntryEditPage binding={binding} id={id} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/$id/')({
    validateSearch: validateEntryEditSearch,
    component: PluginEntryEditPage,
});
