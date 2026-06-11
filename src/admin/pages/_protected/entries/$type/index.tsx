/**
 * Entry type list route — root entry types.
 *
 * Thin wrapper: builds the root `EntriesSurface` (root entries client,
 * unscoped cache, `/entries/{type}` links, `entry:{type}:{action}` permissions)
 * and renders the shared `EntriesListPage`.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Astromech } from '@/sdk/fetch/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page.js';
import type { EntriesApi } from '@/types/index.js';
import type { EntriesSurface } from '@/admin/components/entries/surface.js';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    const surface: EntriesSurface = {
        api: Astromech.entries as unknown as EntriesApi,
        type,
        cacheScope: '',
        config: adminConfig.entries[type],
        basePath: `/entries/${type}`,
        permissionFor: (action) => `entry:${type}:${action}`,
    };
    return <EntriesListPage surface={surface} />;
}

export const Route = createFileRoute('/_protected/entries/$type/')({
    component: EntryIndexPage,
});
