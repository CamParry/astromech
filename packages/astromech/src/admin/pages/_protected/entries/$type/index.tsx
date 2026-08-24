/**
 * Entry type list route — root entry types. Builds the root `EntriesMount`
 * and renders the shared `EntriesListPage`; a qualified type redirects to
 * the plugin route.
 */
import type { EntriesMount } from '@/admin/components/entries/mount';
import type { EntriesService } from '@/types/index';
import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import { validateEntriesListSearch } from '@/admin/components/entries/mount';
import { useAiContext } from '@/admin/context/ai-context';
import { pluginEntryRouteParams } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    useAiContext(
        { kind: 'entries', type, label: adminConfig.entries[type]?.plural ?? type },
        { depth: 0 }
    );
    const mount: EntriesMount = {
        api: astromechClient.entries as unknown as EntriesService,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntriesListPage mount={mount} />;
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
