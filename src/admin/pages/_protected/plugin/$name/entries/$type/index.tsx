/**
 * Plugin entry-type list route.
 *
 * Static segments (`/plugin/$name/entries/$type`) outrank the `/plugin/$`
 * splat, so plugin entry types get real file-based routes. Builds a plugin
 * `EntriesMount` from `adminConfig.plugins` + a `/plugins/{name}/entries`-
 * bound client and renders the shared `EntriesListPage`. Unknown plugin/type
 * falls back to the standard not-found UI.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createEntriesApi } from '@/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page.js';
import {
    buildPluginEntriesMount,
    validateEntriesListSearch,
} from '@/admin/components/entries/mount.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

function PluginEntryListPage(): React.ReactElement {
    const { name, type } = Route.useParams();
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
    return <EntriesListPage mount={mount} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/')({
    validateSearch: validateEntriesListSearch,
    component: PluginEntryListPage,
});
