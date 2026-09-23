/**
 * Entry create route — root entry types. Wraps the shared `EntryNewPage`,
 * carrying the `locale` search param through; a qualified type redirects
 * to the plugin route.
 */

import type { EntriesBinding } from '../../../../components/entries/binding';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { entryPermission } from 'astromech/shared';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryNewPage } from '../../../../components/entries/entry-new-page';
import { pluginEntryRouteParams } from '../../../../utilities/entry-admin-path';

type SearchParams = {
    locale?: string;
};

function EntryCreatePage(): React.ReactElement {
    const { type } = Route.useParams();
    const search = Route.useSearch();
    const binding: EntriesBinding = {
        type,
        cacheScope: '',
        config: adminConfig.entryTypes[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => entryPermission(type, action),
    };
    return <EntryNewPage binding={binding} requestedLocale={search.locale} />;
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
