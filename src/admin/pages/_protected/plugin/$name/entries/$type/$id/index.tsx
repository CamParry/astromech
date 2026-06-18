/**
 * Plugin entry-type edit route.
 *
 * Builds a plugin `EntriesMount` and renders the shared `EntryEditPage`. No
 * loader prefetch: the page's `useEntry` hook fetches via the plugin-scoped
 * client.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createEntriesApi } from '@/transport/http/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page.js';
import { buildPluginEntriesMount } from '@/admin/components/entries/mount.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { t } = useTranslation();
    const api = createEntriesApi(`/plugins/${name}/entries`, 'full');
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
