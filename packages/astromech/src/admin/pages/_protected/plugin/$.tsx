/**
 * Plugin pages catch-all — mounts everything under `/admin/plugin/{name}/*`.
 * Looks up the page by splat, then renders either the shared
 * `SettingsPageForm` (fields mode) or `ComponentPageView` (component mode).
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { pages } from 'virtual:astromech/plugins/components';
import { ComponentErrorBoundary } from '@/admin/components/pages/component-error-boundary';
import { ComponentPageView } from '@/admin/components/pages/component-page-view';
import { SettingsPageForm } from '@/admin/components/pages/settings-page-form';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { useAiContext } from '@/admin/context/ai-context';
import { PluginUiProvider } from '@/admin/context/plugin';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { resolveLabel } from '@/admin/i18n/labels';

function PluginPage(): React.ReactElement {
    const params = Route.useParams();
    const splat = params._splat ?? '';
    const { t } = useTranslation();
    const { hasPermission, canUpdateSettings } = usePermissions();

    // Look up from the unified pages in admin-config.
    const settingsPlugin = adminConfig.plugins.find((plugin) =>
        plugin.pages.some((page) => page.key === splat)
    );
    const settingsPage = settingsPlugin?.pages.find((page) => page.key === splat);

    // Component-mode registration from the codegen registry.
    const registration = pages[splat];

    // Identify the page by its route key (the splat), which both modes carry. A
    // page label matching its plugin's stands alone, as the page header does.
    const pageLabel =
        settingsPage !== undefined
            ? resolveLabel(settingsPage.label, settingsPage.path, t, 'translation')
            : (registration?.label ?? null);
    const ownerLabel = settingsPlugin?.label;
    useAiContext(
        pageLabel !== null
            ? {
                  kind: 'pages',
                  id: splat,
                  label:
                      ownerLabel !== undefined && ownerLabel !== pageLabel
                          ? `${ownerLabel} ${pageLabel}`
                          : pageLabel,
              }
            : null,
        { depth: 0 }
    );

    // Settings-mode page (fields not null, no componentKey): render SettingsPageForm.
    if (
        settingsPlugin &&
        settingsPage &&
        settingsPage.fields !== null &&
        settingsPage.componentKey === null
    ) {
        if (settingsPage.permission !== null && !hasPermission(settingsPage.permission)) {
            return (
                <Page>
                    <PageContent>
                        <div className="am-banner am-banner-error" role="alert">
                            {t('plugins.accessDenied')}
                        </div>
                    </PageContent>
                </Page>
            );
        }

        const pluginLabel = settingsPlugin.label;
        const pageLabel = resolveLabel(
            settingsPage.label,
            settingsPage.path,
            t,
            'translation'
        );
        // Compose plugin label + page label (e.g. "SEO Settings"). A page whose
        // label already matches its plugin's stands alone — a single-page
        // plugin must not render "Backups Backups".
        const composedLabel =
            pluginLabel === pageLabel ? pageLabel : `${pluginLabel} ${pageLabel}`;

        return (
            <PluginUiProvider
                identity={{
                    namespace: settingsPlugin.namespace,
                    serviceKey: settingsPlugin.serviceKey,
                    permissionNamespace: settingsPlugin.permissionNamespace,
                }}
            >
                <ComponentErrorBoundary source={settingsPlugin.namespace}>
                    <SettingsPageForm
                        baseKey={settingsPage.baseKey}
                        fields={settingsPage.fields}
                        label={composedLabel}
                        translatable={settingsPage.translatable}
                        readOnly={!canUpdateSettings()}
                    />
                </ComponentErrorBoundary>
            </PluginUiProvider>
        );
    }

    if (!registration) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('plugins.pageNotFound')}
                        description={`/plugin/${splat}`}
                    />
                </PageContent>
            </Page>
        );
    }

    if (registration.permission !== null && !hasPermission(registration.permission)) {
        return (
            <Page>
                <PageContent>
                    <div className="am-banner am-banner-error" role="alert">
                        {t('plugins.accessDenied')}
                    </div>
                </PageContent>
            </Page>
        );
    }

    const owner = adminConfig.plugins.find(
        (plugin) => plugin.namespace === registration.plugin
    );

    // A page whose label already matches its plugin's stands alone; otherwise
    // compose the two ("SEO Overview"). A null label means no header at all.
    const title =
        registration.label === null
            ? undefined
            : owner !== undefined && owner.label !== registration.label
              ? `${owner.label} ${registration.label}`
              : registration.label;

    return (
        <ComponentPageView
            cacheKey={splat}
            load={registration.load}
            title={title}
            source={registration.plugin}
            identity={{
                namespace: registration.plugin,
                serviceKey: owner?.serviceKey ?? registration.plugin,
                permissionNamespace: owner?.permissionNamespace ?? registration.plugin,
            }}
        />
    );
}

export const Route = createFileRoute('/_protected/plugin/$')({
    component: PluginPage,
});
