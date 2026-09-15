/**
 * Global version history page, parameterized by a `GlobalsBinding`. A version
 * snapshots one locale's content row, so the list is the versions of the
 * locale in view; the list, diff and restore UI is the shared
 * `VersionHistory`.
 */

import type { GlobalsBinding } from './binding';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalVersions, useRestoreGlobalVersion } from '../../hooks/globals';
import { namespaceForScope } from '../../i18n/entry-namespace';
import { resolveLabel } from '../../i18n/labels';
import { defaultContentLocale } from '../../utilities/content-locale';
import { globalEditPath } from '../../utilities/global-admin-path';
import { VersionHistory } from '../versions/version-history';

export function GlobalVersionsPage({
    binding,
    locale: localeProp,
}: {
    binding: GlobalsBinding;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
}): React.ReactElement {
    const { key, api, cacheScope, config, basePath } = binding;
    const locale = localeProp ?? defaultContentLocale();
    const editPath = globalEditPath(basePath, { locale });
    const scope = { api, cacheScope };
    const { t } = useTranslation();
    const navigate = useNavigate();

    const label = resolveLabel(config?.label, key, t, namespaceForScope(cacheScope));

    const { data: versions, isLoading } = useGlobalVersions(key, locale, true, scope);

    const restoreMutation = useRestoreGlobalVersion(key, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: editPath }),
    });

    return (
        <VersionHistory
            versions={versions}
            isLoading={isLoading}
            onRestore={(versionId) => restoreMutation.mutate(versionId)}
            isRestoring={restoreMutation.isPending}
            // A global has no list to go back to, so the trail starts at itself.
            breadcrumb={[{ label, to: editPath }, { label: t('versions.pageTitle') }]}
            editPath={editPath}
            hasTitle={false}
        />
    );
}
