/** Entry edit route for a plugin's types, addressed by the qualified type id. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { EntryEditPage } from '../../../../../../../components/entries/entry-edit-page';
import { validateEntryEditSearch } from '../../../../../../../utilities/entry-admin-path';

function PluginEntryEditPage(): React.ReactElement {
    const { name, type, id } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    return (
        <EntryEditPage
            type={qualifyEntryType(name, type)}
            id={id}
            locale={locale}
            staged={staged}
        />
    );
}

export const Route = createFileRoute('/_protected/plugin/$name/entries/$type/$id/')({
    validateSearch: validateEntryEditSearch,
    component: PluginEntryEditPage,
});
