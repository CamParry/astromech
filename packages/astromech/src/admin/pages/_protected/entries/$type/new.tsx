/**
 * Entry create route — root entry types.
 *
 * Thin wrapper around the shared `EntryNewPage`. Carries the `locale` search
 * param through to the page (drives non-default-locale create flows). A
 * qualified type redirects to the plugin route.
 */

import React from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { astromechClient } from '@/transport/http/client/index';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryNewPage } from '@/admin/components/entries/entry-new-page';
import type { EntriesService } from '@/types/index';
import type { EntriesMount } from '@/admin/components/entries/mount';
import { pluginEntryRouteParams } from '@/admin/utilities/entry-admin-path';

type SearchParams = {
    locale?: string;
};

function EntryCreatePage(): React.ReactElement {
    const { type } = Route.useParams();
    const search = Route.useSearch();
    const mount: EntriesMount = {
        api: astromechClient.entries as unknown as EntriesService,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntryNewPage mount={mount} requestedLocale={search.locale} />;
}

export const Route = createFileRoute('/_protected/entries/$type/new')({
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/new',
                params: plugin,
                search,
            });
        }
    },
    component: EntryCreatePage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
