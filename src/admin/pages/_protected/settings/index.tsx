/**
 * Settings placeholder page.
 */

import React, { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Page, PageHeader, PageTitle, PageContent } from '@/admin/components/ui/index.js';
import { usePermissions } from '@/admin/hooks/index.js';

function SettingsPage(): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { canReadSettings } = usePermissions();

    useEffect(() => {
        if (!canReadSettings()) {
            void navigate({ to: '/' });
        }
    }, [canReadSettings, navigate]);

    // When real settings controls are added, use canUpdateSettings() to
    // conditionally disable or hide save buttons and input fields.

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('settings.title')}</PageTitle>
            </PageHeader>
            <PageContent>
                <EmptyState
                    icon={<SettingsIcon size={32} />}
                    title={t('settings.comingSoon')}
                    description={t('settings.comingSoonDescription')}
                />
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/settings/')({
	component: SettingsPage,
});
