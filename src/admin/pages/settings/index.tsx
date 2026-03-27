/**
 * Settings placeholder page.
 */

import React, { useEffect } from 'react';
import { SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { EmptyState, Page, PageTitle } from '../../components/ui/index.js';
import { usePermissions } from '../../hooks/index.js';

export function SettingsPage(): React.ReactElement {
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
            <PageTitle>{t('settings.title')}</PageTitle>
            <EmptyState
                icon={<SettingsIcon size={32} />}
                title={t('settings.comingSoon')}
                description={t('settings.comingSoonDescription')}
            />
        </Page>
    );
}
