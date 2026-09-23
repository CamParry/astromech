/**
 * Entry version history page for one entry type id. A version
 * snapshots one locale's content row, so the list is the versions of the
 * locale in view; the list, diff and restore UI is the shared
 * `VersionHistory`.
 */

import type { UseAdminEntryTypeResult } from '../../hooks/use-admin-entry-type';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { entryMutations, useEntry, useEntryVersions } from '../../hooks/entries';
import { useAdminEntryType } from '../../hooks/use-admin-entry-type';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { defaultContentLocale } from '../../utilities/content-locale';
import { entryEditPath, entryTypeBasePath } from '../../utilities/entry-admin-path';
import { NotFoundPage } from '../layout/not-found-page';
import { VersionHistory } from '../versions/version-history';

export function EntryVersionsPage({
    type,
    id,
    locale,
}: {
    /** Entry type id: `post`, or `forms/form` for a plugin's. */
    type: string;
    id: string;
    locale: string | undefined;
}): React.ReactElement {
    const entryType = useAdminEntryType(type);
    if (entryType === null) return <NotFoundPage path={entryTypeBasePath(type)} />;
    return <EntryVersionsBody entryType={entryType} id={id} locale={locale} />;
}

function EntryVersionsBody({
    entryType,
    id,
    locale: localeProp,
}: {
    entryType: UseAdminEntryTypeResult;
    id: string;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
}): React.ReactElement {
    const { type, config, basePath } = entryType;
    const locale = localeProp ?? defaultContentLocale();
    const editPath = entryEditPath(basePath, id, { locale });
    const { t } = useTranslation();
    const navigate = useNavigate();

    const plural = config.plural;
    const hasTitle = config.titleField !== false;

    const { data: entry } = useEntry(type, id, locale);
    const { data: versions, isLoading } = useEntryVersions(type, id, locale, true);

    const restoreMutation = useAdminMutation(entryMutations(type).restoreVersion, {
        onSuccess: () => void navigate({ to: editPath }),
    });

    return (
        <VersionHistory
            versions={versions}
            isLoading={isLoading}
            onRestore={(versionId) => restoreMutation.mutate({ id, locale, versionId })}
            isRestoring={restoreMutation.isPending}
            breadcrumb={[
                { label: plural, to: basePath },
                { label: (hasTitle ? entry?.title : undefined) || id, to: editPath },
                { label: t('versions.pageTitle') },
            ]}
            editPath={editPath}
            hasTitle={hasTitle}
        />
    );
}
