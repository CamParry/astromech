/**
 * Entry type list route — root entry types.
 *
 * Thin wrapper: builds the root `EntriesMount` (root entries client,
 * unscoped cache, `/entries/{type}` links, `entry:{type}:{action}` permissions)
 * and renders the shared `EntriesListPage`.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { astromechClient } from '@/transport/http/client/index';
import adminConfig from 'virtual:astromech/admin-config';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import type { EntriesService } from '@/types/index';
import {
    validateEntriesListSearch,
    type EntriesMount,
} from '@/admin/components/entries/mount';
import { useAIContext } from '@/admin/context/ai-context';

function EntryIndexPage(): React.ReactElement {
    const { type } = Route.useParams();
    useAIContext(
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
    component: EntryIndexPage,
});
