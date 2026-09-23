/**
 * Global version history page for one global id. A version
 * snapshots one locale's content row, so the list is the versions of the
 * locale in view; the list, diff and restore UI is the shared
 * `VersionHistory`.
 */

import type { UseAdminGlobalResult } from '../../hooks/use-admin-global';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { globalMutations, useGlobalVersions } from '../../hooks/globals';
import { useAdminGlobal } from '../../hooks/use-admin-global';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { resolveLabel } from '../../i18n/labels';
import { defaultContentLocale } from '../../utilities/content-locale';
import { globalBasePath, globalEditPath } from '../../utilities/global-admin-path';
import { NotFoundPage } from '../layout/not-found-page';
import { VersionHistory } from '../versions/version-history';

export function GlobalVersionsPage({
    globalKey,
    locale,
}: {
    /** Global id: `site`, or `seo/settings` for a plugin's. */
    globalKey: string;
    locale: string | undefined;
}): React.ReactElement {
    const global = useAdminGlobal(globalKey);
    if (global === null) return <NotFoundPage path={globalBasePath(globalKey)} />;
    return <GlobalVersionsBody global={global} locale={locale} />;
}

function GlobalVersionsBody({
    global,
    locale: localeProp,
}: {
    global: UseAdminGlobalResult;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
}): React.ReactElement {
    const { key, config, basePath, namespace } = global;
    const locale = localeProp ?? defaultContentLocale();
    const editPath = globalEditPath(basePath, { locale });
    const { t } = useTranslation();
    const navigate = useNavigate();

    const label = resolveLabel(config.label, key, t, namespace);

    const { data: versions, isLoading } = useGlobalVersions(key, locale, true);

    const restoreMutation = useAdminMutation(globalMutations(key).restoreVersion, {
        onSuccess: () => void navigate({ to: editPath }),
    });

    return (
        <VersionHistory
            versions={versions}
            isLoading={isLoading}
            onRestore={(versionId) => restoreMutation.mutate({ locale, versionId })}
            isRestoring={restoreMutation.isPending}
            // A global has no list to go back to, so the trail starts at itself.
            breadcrumb={[{ label, to: editPath }, { label: t('versions.pageTitle') }]}
            editPath={editPath}
            hasTitle={false}
        />
    );
}
