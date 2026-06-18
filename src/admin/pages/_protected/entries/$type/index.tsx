/**
 * Entry type list route — root entry types.
 *
 * Thin wrapper: builds the root `EntriesMount` (root entries client,
 * unscoped cache, `/entries/{type}` links, `entry:{type}:{action}` permissions)
 * and renders the shared `EntriesListPage`.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Astromech } from '@/transport/http/client/index.js';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page.js';
import type { EntriesApi } from '@/types/index.js';
import {
    validateEntriesListSearch,
    type EntriesMount,
} from '@/admin/components/entries/mount.js';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    const mount: EntriesMount = {
        api: Astromech.entries as unknown as EntriesApi,
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
    component: EntryIndexPage,
});
