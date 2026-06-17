/**
 * Plugin entry-type version history route.
 *
 * Capability-gated at the surface level: types with versioning off (e.g.
 * redirects) never link here. Builds a plugin `EntriesSurface` and renders the
 * shared `EntryVersionsPage`.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createEntriesApi } from '@/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryVersionsPage } from '@/admin/components/entries/entry-versions-page.js';
import { buildPluginEntriesSurface } from '@/admin/components/entries/surface.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

function PluginEntryVersionsPage(): React.ReactElement {
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
    return <EntryVersionsPage surface={surface} id={id} />;
}

export const Route = createFileRoute(
    '/_protected/plugin/$name/entries/$type/$id/versions'
)({
    component: PluginEntryVersionsPage,
});
