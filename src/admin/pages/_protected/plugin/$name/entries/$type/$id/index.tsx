/**
 * Plugin entry-type edit route.
 *
 * Builds a plugin `EntriesSurface` and renders the shared `EntryEditPage`. No
 * loader prefetch: the page's `useEntry` hook fetches via the plugin-scoped
 * client.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createEntriesApi } from '@/sdk/fetch/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page.js';
import { buildPluginEntriesSurface } from '@/admin/components/entries/surface.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { t } = useTranslation();
    const api = createEntriesApi(`/plugins/${name}/entries`);
    const surface = buildPluginEntriesSurface(adminConfig.plugins, name, type, api);
    if (!surface) {
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
    return <EntryEditPage surface={surface} id={id} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/$id/')({
    component: PluginEntryEditPage,
});
