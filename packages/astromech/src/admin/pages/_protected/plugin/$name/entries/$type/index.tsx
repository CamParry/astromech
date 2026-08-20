/**
 * Plugin entry-type list route. Builds a plugin `EntriesMount` from
 * `adminConfig.plugins` and renders the shared `EntriesListPage`; an unknown
 * plugin/type falls back to the standard not-found UI.
 */

import type { EntriesService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import {
    buildPluginEntriesMount,
    validateEntriesListSearch,
} from '@/admin/components/entries/mount';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index';
import { useAiContext } from '@/admin/context/ai-context';
import { astromechClient } from '@/transport/http/client/index';

function PluginEntryListPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const mount = buildPluginEntriesMount(adminConfig.plugins, name, type, api);
    // The mount carries the qualified type id the entries service addresses.
    useAiContext(
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
