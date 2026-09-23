/**
 * Entry type list route — root entry types. Builds the root `EntriesBinding`
 * and renders the shared `EntriesListPage`; a qualified type redirects to
 * the plugin route.
 */
import type { EntriesBinding } from '../../../../components/entries/binding';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { entryPermission } from 'astromech/shared';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { validateEntriesListSearch } from '../../../../components/entries/binding';
import { EntriesListPage } from '../../../../components/entries/entries-list-page';
import { useAiContext } from '../../../../context/ai-context';
import { pluginEntryRouteParams } from '../../../../utilities/entry-admin-path';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    useAiContext(
        { kind: 'entries', type, label: adminConfig.entryTypes[type]?.plural ?? type },
        { depth: 0 }
    );
    const binding: EntriesBinding = {
        type,
        cacheScope: '',
        config: adminConfig.entryTypes[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => entryPermission(type, action),
    };
    return <EntriesListPage binding={binding} />;
}

export const Route = createFileRoute('/_protected/entries/$type/')({
    validateSearch: validateEntriesListSearch,
    beforeLoad: ({ params, search }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type',
                params: plugin,
                search,
            });
        }
    },
    component: EntryIndexPage,
});
