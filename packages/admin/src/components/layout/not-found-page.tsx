/**
 * The page an admin route renders when its entry type or global is not in the
 * config, the site's or a plugin's.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui/empty-state';
import { Page, PageContent } from '../ui/page';

export function NotFoundPage({ path }: { path: string }): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Page>
            <PageContent>
                <EmptyState title={t('errors.notFound')} description={path} />
            </PageContent>
        </Page>
    );
}
