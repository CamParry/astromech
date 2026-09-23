/** Entry create route for a plugin's types, carrying the `locale` search param through. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { EntryNewPage } from '../../../../../../components/entries/entry-new-page';

type SearchParams = {
    locale?: string;
};

function PluginEntryNewPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    const search = Route.useSearch();
    return (
        <EntryNewPage
            type={qualifyEntryType(name, type)}
            requestedLocale={search.locale}
        />
    );
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/new')({
    component: PluginEntryNewPage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
