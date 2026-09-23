/**
 * Entry version history page, parameterized by an `EntriesBinding`. A version
 * snapshots one locale's content row, so the list is the versions of the
 * locale in view; the list, diff and restore UI is the shared
 * `VersionHistory`.
 */

import type { EntriesBinding } from './binding';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { entryMutations, useEntry, useEntryVersions } from '../../hooks/entries';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { defaultContentLocale } from '../../utilities/content-locale';
import { entryEditPath } from '../../utilities/entry-admin-path';
import { VersionHistory } from '../versions/version-history';

export function EntryVersionsPage({
    binding,
    id,
    locale: localeProp,
}: {
    binding: EntriesBinding;
    id: string;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
}): React.ReactElement {
    const { type, config: entryType, basePath } = binding;
    const locale = localeProp ?? defaultContentLocale();
    const editPath = entryEditPath(basePath, id, { locale });
    const { t } = useTranslation();
    const navigate = useNavigate();

    const plural = entryType?.plural ?? type;
    const hasTitle = entryType?.titleField !== false;

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
