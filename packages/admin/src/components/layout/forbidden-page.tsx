/**
 * The page an admin route renders in place when the signed-in user lacks the
 * permission it needs. The URL stays, so a deep link shows why the page is empty.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageContent } from '../ui/page';

export function ForbiddenPage(): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Page>
            <PageContent>
                <div className="am-banner am-banner-error" role="alert">
                    {t('errors.forbidden')}
                </div>
            </PageContent>
        </Page>
    );
}
