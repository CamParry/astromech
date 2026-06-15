/**
 * Plugin pages catch-all — mounts everything under `/admin/plugin/{name}/*`.
 *
 * Plugin routes merge into the file-based tree through this single
 * runtime-resolved route (spec §7): the splat (`{name}{path}`) looks up the
 * page registration code-gen'd into `virtual:astromech/plugins/components`,
 * lazy-loads its component, and renders it behind a permission check and a
 * per-plugin error boundary.
 *
 * Settings pages (those with `fields`, no `component`) use the shared
 * SettingsPageForm renderer — same layout as host pages: header save button,
 * dirty indicator, locale switcher.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { pages } from 'virtual:astromech/plugins/components';
import adminConfig from 'virtual:astromech/admin-config';
import { usePermissions } from '@/admin/hooks/index.js';
import { PluginErrorBoundary } from '@/admin/components/plugins/PluginErrorBoundary.js';
import { SettingsPageForm } from '@/admin/components/pages/SettingsPageForm.js';
import { PluginUiProvider } from '@/admin/context/plugin.js';
import {
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Spinner,
} from '@/admin/components/ui/index.js';
import { resolveLabel } from '@/admin/i18n/labels.js';

type LazyPage = React.LazyExoticComponent<React.ComponentType>;

const lazyCache = new Map<string, LazyPage>();

function lazyPageFor(key: string): LazyPage {
    const cached = lazyCache.get(key);
    if (cached) return cached;

    const registration = pages[key];
    if (!registration) {
        throw new Error(`[Astromech] No plugin page registered for "${key}".`);
    }
    const lazy = React.lazy(registration.load);
    lazyCache.set(key, lazy);
    return lazy;
}

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

    // Settings-mode page (fields not null, no componentKey): render SettingsPageForm.
    if (settingsPlugin && settingsPage && settingsPage.fields !== null && settingsPage.componentKey === null) {
        if (
            settingsPage.permission !== null &&
            !hasPermission(settingsPage.permission)
        ) {
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
        const pageLabel = resolveLabel(settingsPage.label, settingsPage.path, t, 'translation');
        // Compose plugin label + page label (e.g. "SEO Settings")
        const composedLabel = `${pluginLabel} ${pageLabel}`;

        return (
            <PluginUiProvider
                identity={{
                    name: settingsPlugin.name,
                    permissionNamespace: settingsPlugin.permissionNamespace,
                }}
            >
                <PluginErrorBoundary plugin={settingsPlugin.name}>
                    <SettingsPageForm
                        baseKey={settingsPage.baseKey}
                        fields={settingsPage.fields}
                        label={composedLabel}
                        translatable={settingsPage.translatable}
                        readOnly={!canUpdateSettings()}
                    />
                </PluginErrorBoundary>
            </PluginUiProvider>
        );
    }

    // Component-mode page: look up in the codegen registry.
    const registration = pages[splat];

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

    const LazyComponent = lazyPageFor(splat);
    const owner = adminConfig.plugins.find(
        (plugin) => plugin.name === registration.plugin
    );

    return (
        <Page>
            {registration.label !== null && (
                <PageHeader>
                    <PageTitle>
                        {owner !== undefined
                            ? `${owner.label} ${registration.label}`
                            : registration.label}
                    </PageTitle>
                </PageHeader>
            )}
            <PageContent>
                <PluginUiProvider
                    identity={{
                        name: registration.plugin,
                        permissionNamespace:
                            owner?.permissionNamespace ?? registration.plugin,
                    }}
                >
                    <PluginErrorBoundary plugin={registration.plugin}>
                        <React.Suspense fallback={<Spinner size="md" />}>
                            <LazyComponent />
                        </React.Suspense>
                    </PluginErrorBoundary>
                </PluginUiProvider>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/plugin/$')({
    component: PluginPage,
});
