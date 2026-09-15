/**
 * Plugin entry-type version history route. Builds a plugin `EntriesBinding`
 * and renders the shared `EntryVersionsPage`; types with versioning off
 * never link here.
 */

import type { EntriesService } from 'astromech';
import { createFileRoute } from '@tanstack/react-router';
import { astromechClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginEntriesBinding } from '../../../../../../../components/entries/binding';
import { EntryVersionsPage } from '../../../../../../../components/entries/entry-versions-page';
import { EmptyState } from '../../../../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../../../../components/ui/page';
import { validateEntryEditSearch } from '../../../../../../../utilities/entry-admin-path';

function PluginEntryVersionsPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { locale } = Route.useSearch();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const binding = buildPluginEntriesBinding(adminConfig.plugins, name, type, api);
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
    return <EntryVersionsPage binding={binding} id={id} locale={locale} />;
}

export const Route = createFileRoute(
    '/_protected/plugin/$name/entries/$type/$id/versions'
)({
    validateSearch: validateEntryEditSearch,
    component: PluginEntryVersionsPage,
});
