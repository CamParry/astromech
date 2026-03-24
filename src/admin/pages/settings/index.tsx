/**
 * Settings placeholder page.
 */

import React from 'react';
import { SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Page, PageTitle } from '../../components/ui/index.js';

export function SettingsPage(): React.ReactElement {
    const { t } = useTranslation();
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
