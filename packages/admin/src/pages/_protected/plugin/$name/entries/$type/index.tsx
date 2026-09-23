/** Entry type list route for a plugin's types, addressed by the qualified type id. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { EntriesListPage } from '../../../../../../components/entries/entries-list-page';
import { validateEntriesListSearch } from '../../../../../../utilities/entry-admin-path';

function PluginEntryListPage(): React.ReactElement {
    const { name, type } = Route.useParams();
    return <EntriesListPage type={qualifyEntryType(name, type)} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/')({
    validateSearch: validateEntriesListSearch,
    component: PluginEntryListPage,
});
