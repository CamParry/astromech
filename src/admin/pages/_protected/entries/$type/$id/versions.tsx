/**
 * Entry version history route — root entry types.
 *
 * Thin wrapper around the shared `EntryVersionsPage`. The loader prefetches the
 * entry and its versions via the root-scoped query options.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Astromech } from '@/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryVersionsPage } from '@/admin/components/entries/entry-versions-page.js';
import { entryQueryOptions, entryVersionsQueryOptions } from '@/admin/hooks/entries.js';
import type { EntriesApi } from '@/types/index.js';
import type { EntriesSurface } from '@/admin/components/entries/surface.js';

function EntryVersionsRoutePage(): React.ReactElement {
    const { type, id } = Route.useParams();
    const surface: EntriesSurface = {
        api: Astromech.entries as unknown as EntriesApi,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntryVersionsPage surface={surface} id={id} />;
}

export const Route = createFileRoute('/_protected/entries/$type/$id/versions')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(
                entryQueryOptions(params.type, params.id)
            ),
            context.queryClient.ensureQueryData(
                entryVersionsQueryOptions(params.type, params.id)
            ),
        ]),
    component: EntryVersionsRoutePage,
});
