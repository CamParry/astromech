/**
 * Entry edit route — root entry types.
 *
 * Thin wrapper around the shared `EntryEditPage`. The loader prefetches the
 * entry via the root-scoped query options.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Astromech } from '@/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page.js';
import { entryQueryOptions } from '@/admin/hooks/entries.js';
import type { EntriesApi } from '@/types/index.js';
import type { EntriesMount } from '@/admin/components/entries/mount.js';

function EntryEditRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const mount: EntriesMount = {
        api: Astromech.entries as unknown as EntriesApi,
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
