/**
 * Plugin entry-type list route.
 *
 * Static segments (`/plugin/$name/entries/$type`) outrank the `/plugin/$`
 * splat, so plugin entry types get real file-based routes. Builds a plugin
 * `EntriesMount` from `adminConfig.plugins` + the one entries client and
 * renders the shared `EntriesListPage`. Unknown plugin/type falls back to the
 * standard not-found UI.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client/index';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import {
    buildPluginEntriesMount,
    validateEntriesListSearch,
} from '@/admin/components/entries/mount';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index';
import { useAIContext } from '@/admin/context/ai-context';
import type { EntriesService } from '@/types/index';

function PluginEntryListPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const mount = buildPluginEntriesMount(adminConfig.plugins, name, type, api);
    // The mount carries the qualified type id the entries service addresses.
    useAIContext(
        mount !== null
            ? {
                  kind: 'entries',
                  type: mount.type,
                  label: mount.config?.plural ?? mount.type,
              }
            : null,
        { depth: 0 }
    );
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
