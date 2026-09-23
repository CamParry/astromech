/** Entry version history route for a plugin's types, addressed by the qualified type id. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { EntryVersionsPage } from '../../../../../../../components/entries/entry-versions-page';
import { validateEntryEditSearch } from '../../../../../../../utilities/entry-admin-path';

function PluginEntryVersionsPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { locale } = Route.useSearch();
    return (
        <EntryVersionsPage type={qualifyEntryType(name, type)} id={id} locale={locale} />
    );
}

export const Route = createFileRoute(
    '/_protected/plugin/$name/entries/$type/$id/versions'
)({
    validateSearch: validateEntryEditSearch,
    component: PluginEntryVersionsPage,
});
