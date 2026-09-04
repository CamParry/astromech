/**
 * Plugin entry-type edit route. Builds a plugin `EntriesBinding` and renders
 * the shared `EntryEditPage`; no loader prefetch, the page's `useEntry`
 * hook fetches instead.
 */

import type { EntriesService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginEntriesBinding } from '@/admin/components/entries/binding';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { validateEntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { locale, staged } = Route.useSearch();
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
    return <EntryEditPage binding={binding} id={id} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/$id/')({
    validateSearch: validateEntryEditSearch,
    component: PluginEntryEditPage,
});
