/**
 * Entry edit route — root entry types. Wraps the shared `EntryEditPage`; the
 * loader prefetches the entry, and a qualified type redirects to the plugin
 * route.
 */

import type { EntriesBinding } from '../../../../../components/entries/binding';
import type { EntriesService } from 'astromech';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { astromechClient } from 'astromech/fetch';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '../../../../../components/entries/entry-edit-page';
import { entryQueryOptions } from '../../../../../hooks/entries';
import { defaultContentLocale } from '../../../../../utilities/content-locale';
import {
    pluginEntryRouteParams,
    validateEntryEditSearch,
} from '../../../../../utilities/entry-admin-path';

function EntryEditRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    const binding: EntriesBinding = {
        api: astromechClient.entries as unknown as EntriesService,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntryEditPage binding={binding} id={id} locale={locale} staged={staged} />;
}

export const Route = createFileRoute('/_protected/entries/$type/$id/')({
    validateSearch: validateEntryEditSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/$id',
                params: { ...plugin, id: params.id },
                search,
            });
        }
    },
    // The staged row is not readable through `get`, so only the canonical row
    // is prefetched; the page's `useGetStaged` fetches the other.
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: ({ context, params, deps }) =>
        context.queryClient.ensureQueryData(
            entryQueryOptions(
                params.type,
                params.id,
                deps.locale ?? defaultContentLocale()
            )
        ),
    component: EntryEditRoutePage,
});
