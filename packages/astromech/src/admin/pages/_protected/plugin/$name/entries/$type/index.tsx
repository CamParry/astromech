/**
 * Plugin entry-type list route. Builds a plugin `EntriesBinding` from
 * `adminConfig.plugins` and renders the shared `EntriesListPage`; an unknown
 * plugin/type falls back to the standard not-found UI.
 */

import type { EntriesService } from '@/types/index';
import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import {
    buildPluginEntriesBinding,
    validateEntriesListSearch,
} from '@/admin/components/entries/binding';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { useAiContext } from '@/admin/context/ai-context';
import { astromechClient } from '@/transport/http/client';

function PluginEntryListPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const binding = buildPluginEntriesBinding(adminConfig.plugins, name, type, api);
    // The binding carries the qualified type id the entries service addresses.
    useAiContext(
        binding !== null
            ? {
                  kind: 'entries',
                  type: binding.type,
                  label: binding.config?.plural ?? binding.type,
              }
            : null,
        { depth: 0 }
    );
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
    return <EntriesListPage binding={binding} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/')({
    validateSearch: validateEntriesListSearch,
    component: PluginEntryListPage,
});
