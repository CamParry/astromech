/** Global edit route for a plugin's globals, addressed by the qualified global id. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { GlobalEditPage } from '../../../../../../components/globals/global-edit-page';
import { validateEntryEditSearch } from '../../../../../../utilities/entry-admin-path';

function PluginGlobalEditPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale, staged } = Route.useSearch();
    return (
        <GlobalEditPage
            globalKey={qualifyEntryType(name, key)}
            locale={locale}
            staged={staged}
        />
    );
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalEditPage,
});
