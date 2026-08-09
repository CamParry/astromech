/**
 * Plugin entry-type version history route.
 *
 * Capability-gated at the mount level: types with versioning off (e.g.
 * redirects) never link here. Builds a plugin `EntriesMount` and renders the
 * shared `EntryVersionsPage`.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client/index';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryVersionsPage } from '@/admin/components/entries/entry-versions-page';
import { buildPluginEntriesMount } from '@/admin/components/entries/mount';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index';
import type { EntriesService } from '@/types/index';

function PluginEntryVersionsPage(): React.ReactElement {
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
    return <EntryVersionsPage mount={mount} id={id} />;
}

export const Route = createFileRoute(
    '/_protected/plugin/$name/entries/$type/$id/versions'
)({
    component: PluginEntryVersionsPage,
});
