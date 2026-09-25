/**
 * Global edit page for one global id, the site's or a plugin's, built from the
 * entry edit page's pieces over `useEditController`. A global has no list,
 * nothing to duplicate and nothing to delete, so the header is shorter.
 */

import type { UseAdminGlobalResult } from '../../hooks/use-admin-global';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { useAdminGlobal } from '../../hooks/use-admin-global';
import { globalEditResource, useEditController } from '../../hooks/use-edit-controller';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { resolveLabel } from '../../i18n/labels';
import { defaultContentLocale } from '../../utilities/content-locale';
import { globalBasePath, globalEditPath } from '../../utilities/global-admin-path';
import { StatusField } from '../entries/entry-form-fields';
import { EditActions, EditBanners, VersionsLink } from '../entries/staging-controls';
import { FieldColumn, FieldsForm } from '../forms/fields-form';
import { NotFoundPage } from '../layout/not-found-page';
import { LocaleSwitcher } from '../translations/locale-switcher';
import { Breadcrumb } from '../ui/breadcrumb';
import {
    Page,
    PageContent,
    PageHeader,
    PageHeaderActions,
    PageLoading,
    PageTitle,
} from '../ui/page';
import { StatusBadge } from '../ui/status-badge';

type GlobalEditPageProps = {
    /** Global id: `site`, or `seo/settings` for a plugin's. */
    globalKey: string;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
    /** Show the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

/**
 * Keyed by the row in view: the locale switcher and the staging controls both
 * swap the row under the same route. Without the key TanStack Form and the
 * stateful field containers would keep the last row's state.
 */
export function GlobalEditPage({
    globalKey,
    locale,
    staged = false,
}: GlobalEditPageProps): React.ReactElement {
    const global = useAdminGlobal(globalKey);
    const resolvedLocale = locale ?? defaultContentLocale();
    if (global === null) return <NotFoundPage path={globalBasePath(globalKey)} />;
    return (
        <GlobalEditBody
            key={`${globalKey}:${resolvedLocale}:${String(staged)}`}
            global={global}
            locale={resolvedLocale}
            staged={staged}
        />
    );
}

function GlobalEditBody({
    global,
    locale,
    staged,
}: {
    global: UseAdminGlobalResult;
    locale: string;
    staged: boolean;
}): React.ReactElement {
    const { key, config, basePath, namespace } = global;
    const { t } = useTranslation();
    const navigate = useNavigate();
    const label = resolveLabel(config.label, key, t, namespace);
    const { capabilities } = config;

    // `null` is a declared global nobody has saved yet: an empty form, whose
    // first save is the `update` that creates the row.
    const controller = useEditController(globalEditResource(global, locale, label), {
        staged,
    });
    const { record, form, isStaged, isReadOnly } = controller;

    // A global's label comes from the config, so it is known before the row is.
    useAiContext({ kind: 'globals', id: key, label }, { depth: 1 });

    if (controller.isLoading) return <PageLoading />;

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb items={[{ label }]} />
                    </PageTitle>
                    <PageHeaderActions>
                        {!isReadOnly && controller.isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {capabilities.statuses && !isStaged && record !== null && (
                            <StatusBadge status={record.status} />
                        )}
                        {!isStaged && capabilities.translatable && (
                            <LocaleSwitcher
                                id={key}
                                currentLocale={locale}
                                basePath={basePath}
                                locales={record?.locales ?? [locale]}
                                allLocales={adminConfig.locales}
                                defaultLocale={defaultContentLocale()}
                                // A locale with no row renders an empty form,
                                // and its first save writes the row, so the
                                // switch is a navigation, not a mutation.
                                onSelectMissing={(next) =>
                                    void navigate({
                                        to: globalEditPath(basePath, { locale: next }),
                                    })
                                }
                                compact
                            />
                        )}
                        <EditActions controller={controller} />
                    </PageHeaderActions>
                </PageHeader>

                <PageContent>
                    <EditBanners controller={controller} title={label} />
                    <FieldsForm
                        form={controller}
                        main={
                            <FieldColumn form={controller} fields={config.fields.main} />
                        }
                        sidebar={
                            <>
                                {capabilities.statuses && !isStaged && (
                                    <StatusField
                                        form={form}
                                        savedPublishedAt={record?.publishedAt}
                                        disabled={isReadOnly}
                                    />
                                )}
                                <FieldColumn
                                    form={controller}
                                    fields={config.fields.sidebar}
                                />
                                {capabilities.versioning && !isStaged && (
                                    <VersionsLink controller={controller} />
                                )}
                            </>
                        }
                    />
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
