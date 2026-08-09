/**
 * Entry edit route — root entry types.
 *
 * Thin wrapper around the shared `EntryEditPage`. The loader prefetches the
 * entry via the root-scoped query options.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { astromechClient } from '@/transport/http/client/index';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { entryQueryOptions } from '@/admin/hooks/entries';
import type { EntriesService } from '@/types/index';
import type { EntriesMount } from '@/admin/components/entries/mount';

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
    loader: ({ context, params }) =>
        context.queryClient.ensureQueryData(entryQueryOptions(params.type, params.id)),
    component: EntryEditRoutePage,
});
