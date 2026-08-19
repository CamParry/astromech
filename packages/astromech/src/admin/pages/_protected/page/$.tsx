/**
 * Host-defined admin pages catch-all — mounts everything under `/admin/page/*`.
 *
 * Looks up the page by splat path in `adminConfig.pages` (resolved unified
 * ResolvedAdminPage[]), then renders:
 * - `fields` mode → shared SettingsPageForm (query-load, dirty tracking, header save)
 * - `component` mode → shared ComponentPageView, over the lazy import code-gen'd
 *   into `virtual:astromech/plugins/components` as `hostPages`
 */

import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { hostPages } from 'virtual:astromech/plugins/components';
import { ComponentPageView } from '@/admin/components/pages/component-page-view';
import { SettingsPageForm } from '@/admin/components/pages/settings-page-form';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index';
import { useAiContext } from '@/admin/context/ai-context';
import { usePermissions } from '@/admin/hooks/index';
import { resolveLabel } from '@/admin/i18n/labels';

// ============================================================================
// Route component
// ============================================================================

function AppPage(): React.ReactElement {
    const params = Route.useParams();
    const splat = params._splat ?? '';
    const { t } = useTranslation();
    const { hasPermission, canUpdateSettings } = usePermissions();

    const page = adminConfig.pages.find((p) => p.path === splat);

    // Identify the page by its route key (the splat), which every mode carries.
    useAiContext(
        page !== undefined
            ? {
                  kind: 'pages',
                  id: page.key,
                  label: resolveLabel(page.label, page.path, t, 'translation'),
              }
            : null,
        { depth: 0 }
    );

    if (!page) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('pages.notFound')}
                        description={`/page/${splat}`}
                    />
                </PageContent>
            </Page>
        );
    }

    // The page's own resolved permission: `settings:read` for a fields page,
    // null (unguarded) for a component page unless it declared one.
    if (page.permission !== null && !hasPermission(page.permission)) {
        return (
            <Page>
                <PageContent>
                    <div className="am-banner am-banner-error" role="alert">
                        {t('pages.accessDenied')}
                    </div>
                </PageContent>
            </Page>
        );
    }

    // fields mode
    if (page.fields !== null) {
        return (
            <SettingsPageForm
                baseKey={page.baseKey}
                fields={page.fields}
                label={page.label}
                translatable={page.translatable}
                readOnly={!canUpdateSettings()}
            />
        );
    }

    // component mode
    const registration =
        page.componentKey !== null ? hostPages[page.componentKey] : undefined;

    if (!registration) {
        return (
            <Page>
                <PageContent>
                    <EmptyState
                        title={t('pages.notFound')}
                        description={`/page/${splat}`}
                    />
                </PageContent>
            </Page>
        );
    }

    return (
        <ComponentPageView
            cacheKey={`host:${page.componentKey}`}
            load={registration.load}
            title={resolveLabel(page.label, page.path, t, 'translation')}
            source={page.path}
        />
    );
}

export const Route = createFileRoute('/_protected/page/$')({
    component: AppPage,
});
