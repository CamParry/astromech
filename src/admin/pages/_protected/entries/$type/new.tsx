/**
 * Entry create route — root entry types.
 *
 * Thin wrapper around the shared `EntryNewPage`. Carries the `locale` search
 * param through to the page (drives non-default-locale create flows).
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Astromech } from '@/sdk/fetch/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryNewPage } from '@/admin/components/entries/entry-new-page.js';
import type { EntriesApi } from '@/types/index.js';
import type { EntriesSurface } from '@/admin/components/entries/surface.js';

type SearchParams = {
    locale?: string;
};

function EntryCreatePage(): React.ReactElement {
    const { type } = Route.useParams();
    const search = Route.useSearch();
    const surface: EntriesSurface = {
        api: Astromech.entries as unknown as EntriesApi,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntryNewPage surface={surface} requestedLocale={search.locale} />;
}

export const Route = createFileRoute('/_protected/entries/$type/new')({
    component: EntryCreatePage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
