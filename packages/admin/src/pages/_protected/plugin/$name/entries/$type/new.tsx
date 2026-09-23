/**
 * Plugin entry-type create route.
 *
 * Builds a plugin `EntriesBinding` and renders the shared `EntryNewPage`.
 * Carries the `locale` search param through.
 */

import type { EntriesService } from 'astromech';
import { createFileRoute } from '@tanstack/react-router';
import { astromechClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { buildPluginEntriesBinding } from '../../../../../../components/entries/binding';
import { EntryNewPage } from '../../../../../../components/entries/entry-new-page';
import { EmptyState } from '../../../../../../components/ui/empty-state';
import { Page, PageContent } from '../../../../../../components/ui/page';

type SearchParams = {
    locale?: string;
};

function PluginEntryNewPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const search = Route.useSearch();
    const { t } = useTranslation();
    const api = astromechClient.entries as unknown as EntriesService;
    const binding = buildPluginEntriesBinding(adminConfig, name, type, api);
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
    return <EntryNewPage binding={binding} requestedLocale={search.locale} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/new')({
    component: PluginEntryNewPage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
