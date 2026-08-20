/**
 * Plugin entry-type edit route. Builds a plugin `EntriesMount` and renders
 * the shared `EntryEditPage`; no loader prefetch, the page's `useEntry`
 * hook fetches instead.
 */

import type { EntriesService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { buildPluginEntriesMount } from '@/admin/components/entries/mount';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index';
import { astromechClient } from '@/transport/http/client/index';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const mount = buildPluginEntriesMount(adminConfig.plugins, name, type, api);
    if (!mount) {
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
    return <EntryEditPage mount={mount} id={id} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/$id/')({
    component: PluginEntryEditPage,
});
