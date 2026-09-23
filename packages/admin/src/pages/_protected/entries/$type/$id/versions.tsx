/**
 * Entry version history route — root entry types. Wraps the shared
 * `EntryVersionsPage`; the loader prefetches the entry and its versions,
 * and a qualified type redirects to the plugin route.
 */

import type { EntriesBinding } from '../../../../../components/entries/binding';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { entryPermission } from 'astromech/shared';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryVersionsPage } from '../../../../../components/entries/entry-versions-page';
import {
    entryQueryOptions,
    entryVersionsQueryOptions,
} from '../../../../../hooks/entries';
import { defaultContentLocale } from '../../../../../utilities/content-locale';
import {
    pluginEntryRouteParams,
    validateEntryEditSearch,
} from '../../../../../utilities/entry-admin-path';

function EntryVersionsRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const { locale } = Route.useSearch();
    const binding: EntriesBinding = {
        type,
        cacheScope: '',
        config: adminConfig.entryTypes[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => entryPermission(type, action),
    };
    return <EntryVersionsPage binding={binding} id={id} locale={locale} />;
}

export const Route = createFileRoute('/_protected/entries/$type/$id/versions')({
    validateSearch: validateEntryEditSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/$id/versions',
                params: { ...plugin, id: params.id },
                search,
            });
        }
    },
    loaderDeps: ({ search }) => ({ locale: search.locale }),
    loader: ({ context, params, deps }) => {
        const locale = deps.locale ?? defaultContentLocale();
        return Promise.all([
            context.queryClient.ensureQueryData(
                entryQueryOptions(params.type, params.id, locale)
            ),
            context.queryClient.ensureQueryData(
                entryVersionsQueryOptions(params.type, params.id, locale)
            ),
        ]);
    },
    component: EntryVersionsRoutePage,
});
