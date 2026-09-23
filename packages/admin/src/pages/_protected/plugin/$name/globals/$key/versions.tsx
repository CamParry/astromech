/** Global version history route for a plugin's globals, addressed by the qualified global id. */

import { createFileRoute } from '@tanstack/react-router';
import { qualifyEntryType } from 'astromech/shared';
import React from 'react';
import { GlobalVersionsPage } from '../../../../../../components/globals/global-versions-page';
import { validateEntryEditSearch } from '../../../../../../utilities/entry-admin-path';

function PluginGlobalVersionsPage(): React.ReactElement {
    const { name, key } = Route.useParams();
    const { locale } = Route.useSearch();
    return <GlobalVersionsPage globalKey={qualifyEntryType(name, key)} locale={locale} />;
}

export const Route = createFileRoute('/_protected/plugin/$name/globals/$key/versions')({
    validateSearch: validateEntryEditSearch,
    component: PluginGlobalVersionsPage,
});
