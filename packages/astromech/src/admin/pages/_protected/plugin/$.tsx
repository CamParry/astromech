/**
 * Plugin pages catch-all — mounts everything under `/admin/plugin/{name}/*`.
 * Looks up the page by splat and renders its component. A page declaring a
 * field tree is a global now, so it has no renderer here and falls through to
 * the not-found view.
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { pages } from 'virtual:astromech/plugins/components';
import { ComponentPageView } from '@/admin/components/pages/component-page-view';
import { EmptyState } from '@/admin/components/ui/empty-state';
import { Page, PageContent } from '@/admin/components/ui/page';
import { useAiContext } from '@/admin/context/ai-context';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { resolveLabel } from '@/admin/i18n/labels';

function PluginPage(): React.ReactElement {
    const params = Route.useParams();
    const splat = params._splat ?? '';
    const { t } = useTranslation();
    const { hasPermission } = usePermissions();

    // Look up the declaring plugin from the unified pages in admin-config; it
    // supplies the label the AI context is announced under.
    const owningPlugin = adminConfig.plugins.find((plugin) =>
        plugin.pages.some((page) => page.key === splat)
    );
    const declaredPage = owningPlugin?.pages.find((page) => page.key === splat);

    // Component-mode registration from the codegen registry.
    const registration = pages[splat];

    // Identify the page by its route key (the splat). A page label matching
    // its plugin's stands alone, as the page header does.
    const pageLabel =
        declaredPage !== undefined
            ? resolveLabel(declaredPage.label, declaredPage.path, t, 'translation')
            : (registration?.label ?? null);
    const ownerLabel = owningPlugin?.label;
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
