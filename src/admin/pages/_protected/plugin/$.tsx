/**
 * Plugin pages catch-all — mounts everything under `/admin/plugin/{name}/*`.
 *
 * Plugin routes merge into the file-based tree through this single
 * runtime-resolved route (spec §7): the splat (`{name}{path}`) looks up the
 * page registration code-gen'd into `virtual:astromech/plugins/components`,
 * lazy-loads its component, and renders it behind a permission check and a
 * per-plugin error boundary.
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { pages } from 'virtual:astromech/plugins/components';
import adminConfig from 'virtual:astromech/admin-config';
import { usePermissions } from '@/admin/hooks/index.js';
import { PluginErrorBoundary } from '@/admin/components/plugins/PluginErrorBoundary.js';
import { PluginSettingsPage } from '@/admin/components/plugins/PluginSettingsPage.js';
import {
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Spinner,
} from '@/admin/components/ui/index.js';

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
    const { hasPermission } = usePermissions();

    const registration = pages[splat];

    if (!registration) {
        // Auto-rendered settings page: `{name}/settings` when the plugin
        // declares `admin.settings` and no explicit page claims the path.
        const settingsPlugin = adminConfig.plugins.find(
            (plugin) => plugin.settings !== null && splat === `${plugin.name}/settings`
        );
        if (settingsPlugin?.settings) {
            return (
                <Page>
                    <PageHeader>
                        <PageTitle>
                            {t('plugins.settingsTitle', { plugin: settingsPlugin.name })}
                        </PageTitle>
                    </PageHeader>
                    <PageContent>
                        <PluginErrorBoundary plugin={settingsPlugin.name}>
                            <PluginSettingsPage
                                plugin={settingsPlugin.name}
                                permissionNamespace={settingsPlugin.permissionNamespace}
                                schema={settingsPlugin.settings}
                            />
                        </PluginErrorBoundary>
                    </PageContent>
                </Page>
            );
        }
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

    return (
        <Page>
            {registration.label !== null && (
                <PageHeader>
                    <PageTitle>{registration.label}</PageTitle>
                </PageHeader>
            )}
            <PageContent>
                <PluginErrorBoundary plugin={registration.plugin}>
                    <React.Suspense fallback={<Spinner size="md" />}>
                        <LazyComponent />
                    </React.Suspense>
                </PluginErrorBoundary>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/plugin/$')({
    component: PluginPage,
});
