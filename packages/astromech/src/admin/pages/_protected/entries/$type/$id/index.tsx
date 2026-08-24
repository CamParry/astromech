/**
 * Entry edit route — root entry types. Wraps the shared `EntryEditPage`; the
 * loader prefetches the entry, and a qualified type redirects to the plugin
 * route.
 */

import type { EntriesMount } from '@/admin/components/entries/mount';
import type { EntriesService } from '@/types/index';
import { createFileRoute, redirect } from '@tanstack/react-router';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { entryQueryOptions } from '@/admin/hooks/entries';
import { pluginEntryRouteParams } from '@/admin/utilities/entry-admin-path';
import { astromechClient } from '@/transport/http/client';

function EntryEditRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const mount: EntriesMount = {
        api: astromechClient.entries as unknown as EntriesService,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntryEditPage mount={mount} id={id} />;
}

export const Route = createFileRoute('/_protected/entries/$type/$id/')({
    beforeLoad: ({ params }) => {
        const plugin = pluginEntryRouteParams(params.type);
        if (plugin !== null) {
            throw redirect({
                to: '/plugin/$name/entries/$type/$id',
                params: { ...plugin, id: params.id },
            });
        }
    },
    loader: ({ context, params }) =>
        context.queryClient.ensureQueryData(entryQueryOptions(params.type, params.id)),
    component: EntryEditRoutePage,
});
