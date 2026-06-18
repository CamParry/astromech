/**
 * Host-defined admin pages catch-all — mounts everything under `/admin/page/*`.
 *
 * Looks up the page by splat path in `adminConfig.pages` (resolved unified
 * ResolvedAdminPage[]), then renders:
 * - `fields` mode → shared SettingsPageForm (query-load, dirty tracking, header save)
 * - `component` mode → not yet supported for host pages (guarded at config resolution)
 */

import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { usePermissions } from '@/admin/hooks/index.js';
import { SettingsPageForm } from '@/admin/components/pages/SettingsPageForm.js';
import { EmptyState, Page, PageContent } from '@/admin/components/ui/index.js';

// ============================================================================
// Route component
// ============================================================================

function AppPage(): React.ReactElement {
    const params = Route.useParams();
    const splat = params._splat ?? '';
    const { t } = useTranslation();
    const { canReadSettings, canUpdateSettings } = usePermissions();

    const page = adminConfig.pages.find((p) => p.path === splat);

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

    if (!canReadSettings()) {
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

    // fields mode (the only supported host mode for now)
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

    // component mode — guarded at config resolution; should never reach here
    return (
        <Page>
            <PageContent>
                <EmptyState
                    title="Not supported"
                    description="Host custom-component admin pages are not yet supported."
                />
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/page/$')({
    component: AppPage,
});
