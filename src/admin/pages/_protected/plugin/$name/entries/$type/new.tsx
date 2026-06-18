/**
 * Plugin entry-type create route.
 *
 * Builds a plugin `EntriesMount` and renders the shared `EntryNewPage`.
 * Carries the `locale` search param through.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createEntriesApi } from '@/transport/http/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryNewPage } from '@/admin/components/entries/entry-new-page.js';
import { buildPluginEntriesMount } from '@/admin/components/entries/mount.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

type SearchParams = {
    locale?: string;
};

function PluginEntryNewPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const search = Route.useSearch();
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
    return <EntryNewPage mount={mount} requestedLocale={search.locale} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/new')({
    component: PluginEntryNewPage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
